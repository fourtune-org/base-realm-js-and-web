import process from "node:process"
import {rollup} from "rollup"
import virtual from "@rollup/plugin-virtual"
import terser from "@rollup/plugin-terser"
import resolveNode from "@rollup/plugin-node-resolve"
import commonJs from "@rollup/plugin-commonjs"

import createVirtualEntry from "./bundler/createVirtualEntry.mjs"
import sortAdditionalPlugins from "./bundler/sortAdditionalPlugins.mjs"
import dts_resolver from "./bundler/dts_resolver.mjs"
import {tsReadTSConfigFile} from "../ts/readTSConfigFile.mjs"
import {dts} from "rollup-plugin-dts"
import {jsGetBaseTsConfigPath} from "./getBaseTsConfigPath.mjs"

import type {RollupOptions} from "rollup"

import type {JsBundlerOptions} from "@fourtune/types/base-realm-js-and-web/v0"

export async function jsBundler(
	project_root : string, entry_code : string, {
		input_file_type = "mjs",
		minify = false,
		treeshake = true,
		additional_plugins = [],
		on_rollup_log_fn = null,
		externals = []
	} : JsBundlerOptions = {}
) {
	const options = {input_file_type}
	const plugins = sortAdditionalPlugins(additional_plugins)

	const saved_cwd = process.cwd()

	//
	// needed to make node resolve work properly
	//
	process.chdir(project_root)

	try {
		const virtual_entries = createVirtualEntry(options, entry_code)

		const rollup_options : RollupOptions = {
			input: Object.keys(virtual_entries)[0],
			output: {
				format: "es"
			},
			treeshake
		}

		// @ts-ignore:next-line
		const rollup_plugins = [virtual(virtual_entries)]

		if (externals.length) {
			rollup_plugins.push({
				resolveId(id: string) {
					if (externals.includes(id)) {
						return {id, external: true}
					}

					return null
				}
			})
		}

		if (input_file_type === "dts") {
			const tsconfig_path = await jsGetBaseTsConfigPath(
				project_root
			)

			const compiler_options = await tsReadTSConfigFile(
				tsconfig_path, project_root
			)

			rollup_plugins.push(dts_resolver(project_root))

			rollup_plugins.push(dts({
				respectExternal: true,
				compilerOptions: {
					...compiler_options,
					// overwrite baseUrl since config resides
					// inside auto/cfg/ folder
					baseUrl: "./",
					//
					// overwrite paths alias since
					// those will be resolved by "dts_resolver"
					//
					paths: {}
				}
			}))
		} else if (input_file_type === "mjs") {
			// @ts-ignore:next-line
			rollup_plugins.push(resolveNode())

			// @ts-ignore:next-line
			rollup_plugins.push(commonJs())
		}

		if (input_file_type === "mjs" && minify) {
			// @ts-ignore:next-line
			rollup_plugins.push(terser())
		}

		const bundle = await rollup({
			...rollup_options,
			plugins: [
				...plugins.pre,
				...rollup_plugins,
				...plugins.post
			],
			onLog(level, error) {
				if (on_rollup_log_fn === null) return

				on_rollup_log_fn(level, error)
			}
		})

		// @ts-ignore:next-line
		const {output} = await bundle.generate(rollup_options.output)

		return output[0].code
	} finally {
		process.chdir(saved_cwd)
	}
}
