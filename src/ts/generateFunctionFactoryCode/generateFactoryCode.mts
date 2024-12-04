import * as ts from "typescript"
import path from "node:path"
import type {TsGenerateFunctionFactoryCodeSource} from "@fourtune/types/base-realm-js-and-web/v0"
import {getTypesReferencedInNode} from "../_utils_to_be_removed/getTypesReferencedInNode.mjs"
import {convertFunctionDeclaration} from "../_utils_to_be_removed/convertFunctionDeclaration.mjs"
import {generateFunctionSignature} from "../_utils_to_be_removed/generateFunctionSignature.mjs"
import {getTopLevelTypes} from "../_utils_to_be_removed/getTopLevelTypes.mjs"
import {resolveTopLevelTypesRecursively} from "../_utils_to_be_removed/resolveTopLevelTypesRecursively.mjs"
import {_getDeclaredAnioSoftwareDependencies} from "./_getDeclaredAnioSoftwareDependencies.mjs"
import {_convertAndSortDependencies} from "./_convertAndSortDependencies.mjs"
import {_usesAnioJsDependencies} from "./_usesAnioJsDependencies.mjs"
import {_generateAnioJsDependenciesImportAndInitCode} from "./_generateAnioJsDependenciesImportAndInitCode.mjs"

export function generateFactoryCode(
	source: TsGenerateFunctionFactoryCodeSource,
	implementation: ts.FunctionDeclaration
) : string {
	const function_name = path.basename(source.output.fn).slice(0, -4)
	const factory_name = path.basename(source.output.factory).slice(0, -4)

	const fn = convertFunctionDeclaration(implementation)
	const uses_dependencies = _usesAnioJsDependencies(fn)
	const params_offset = uses_dependencies ? 2 : 1
	const is_async = fn.modifiers.includes("async")

	const fn_signature = generateFunctionSignature({
		...fn,
		params: fn.params.slice(params_offset)
	}, {
		new_function_name: function_name,
		use_jsdocs: true
	})

	const dependency_map = _getDeclaredAnioSoftwareDependencies(implementation.getSourceFile())

	if (uses_dependencies && dependency_map === null) {
		throw new Error(
			`${source.source}: AnioJsDependencies parameter detected but no AnioJsDependencies type was exported.`
		)
	} else if (!uses_dependencies && dependency_map) {
		throw new Error(
			`${source.source}: AnioJsDependencies parameter not detected but AnioJsDependencies type was exported.`
		)
	}

	const dependencies_code = _generateAnioJsDependenciesImportAndInitCode(dependency_map)

	let anio_js_dependencies_type_import = ``

	if (uses_dependencies) {
		anio_js_dependencies_type_import = `, type AnioJsDependencies`
	}

	let code = ``

	code += `import {implementation${anio_js_dependencies_type_import}} from "${source.source}"\n`
	code += `import type {RuntimeWrappedContextInstance} from "@fourtune/realm-js/runtime"\n`
	code += `import {getProject} from "@fourtune/realm-js/v0/project"\n`

	if (dependencies_code.import_code.length) {
		code += `\n`
		code += `// vvv dependencies declared via AnioJsDependencies type\n`
		code += dependencies_code.import_code
		code += `// ^^^ dependencies declared via AnioJsDependencies type\n`
	}

	code += `\n`

	const top_level_types = getTopLevelTypes(implementation.getSourceFile())
	const used_types = getTypesReferencedInNode(implementation, [
		...fn.type_params.map(type => type.name),
		"AnioJsDependencies",
		"RuntimeWrappedContextInstance"
	])

	const resolved_types = resolveTopLevelTypesRecursively(
		top_level_types, used_types, true
	)

	if (resolved_types.length) {
		code += `// vvv types needed for function signature\n`
		code += resolved_types
		code += `// ^^^ types needed for function signature\n`
		code += `\n`
	}

	code += `${fn_signature}\n`
	code += `\n`

	const factory_jsdoc = `
/**
 * @brief
 * Create an instance of the function '${function_name}'.
 *
 * @param user
 * Options object (see @fourtune/realm-js/v0/runtime) or an already
 * created context with createContext().
 * This parameter is optional.
 *
 * @return
 * An instance of the function '${function_name}'.
 */
`.slice(1)

	code += factory_jsdoc
	code += `export function ${factory_name}(context: RuntimeWrappedContextInstance) : typeof ${function_name} {\n`

	if (uses_dependencies) {
		code += `\tconst dependencies : AnioJsDependencies = {${dependencies_code.init_code}}\n`
		code += `\n`
	}

	let fn_params : string[] = ["local_context"]

	if (uses_dependencies) {
		fn_params.push("dependencies")
	}

	const rest_params = fn.params.slice(params_offset)

	if (rest_params.length) {
		fn_params = [
			...fn_params,
			...fn.params.slice(params_offset).map(param => param.name)
		]
	}

	code += `\tconst project = getProject()\n`
	code += `\tconst local_context : RuntimeWrappedContextInstance = {\n`
	code += `\t\t...context,\n`
	code += `\t\t_package: {\n`
	code += `\t\t\tname: project.package_json.name,\n`
	code += `\t\t\tversion: project.package_json.version,\n`
	code += `\t\t\tauthor: project.package_json.author,\n`
	code += `\t\t\tlicense: project.package_json.license\n`
	code += `\t\t}\n`
	code += `\t}\n`

	code += `\n`

	code += `\treturn ${is_async ? "async " : ""}`

	code += `function ${function_name}${fn.type_params_definition}`
	code += `(`
	code += fn.params.slice(params_offset).map(param => param.definition).join(", ")
	code += `) : ${fn.return_type} {\n`

	code += `\t\treturn ${is_async ? "await " : ""}`
	code += `implementation(${fn_params.join(", ")})\n`

	code += `\t}\n`
	code += `}\n`

	return code
}