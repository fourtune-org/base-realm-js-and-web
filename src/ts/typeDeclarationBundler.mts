import type {
	TsTypeDeclarationBundlerOptions
} from "@fourtune/types/base-realm-js-and-web/v0"

import {jsBundler} from "../js/bundler.mjs"

export async function tsTypeDeclarationBundler(
	project_root: string,
	entry_code: string,
	options: TsTypeDeclarationBundlerOptions = {
		externals: [],
		on_rollup_log_fn: null
	}
) : Promise<string> {
	return await jsBundler(
		project_root,
		entry_code,
		{
			input_file_type: "dts",
			externals: options.externals,
			treeshake: false,
			minify: false,
			additional_plugins: [],
			on_rollup_log_fn: options.on_rollup_log_fn
		}
	)
}
