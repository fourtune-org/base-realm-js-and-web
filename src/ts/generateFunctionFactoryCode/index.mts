import * as ts from "typescript"
import path from "node:path"
import type {TsGenerateFunctionFactoryCodeSource} from "@fourtune/types/base-realm-js-and-web/v0"
import {_createASTFromCode} from "../_helper/createASTFromCode.mjs"
import {_getDeclaredAnioSoftwareDependencies, type AnioJsDependencyMap} from "./_getDeclaredAnioSoftwareDependencies.mjs"
import {_isolateExportedFunction} from "../_helper/isolateExportedFunction.mjs"
import {_isolateTypesUsedInFunction} from "../_helper/isolateTypesUsedInFunction.mjs"
import {_resolveUsedTypesInFunction} from "../_helper/resolveUsedTypesInFunction.mjs"
import {_generateFunctionSignature} from "./_generateFunctionSignature.mjs"
import {_generateFactoryFunction} from "./_generateFactoryFunction.mjs"
import {_sortResolvedEntries} from "./_sortResolvedEntries.mjs"
import {_functionModifiersToString} from "../_helper/functionModifiersToString.mjs"

function _checkImplementation(
	source: ts.SourceFile,
	implementation: ts.FunctionDeclaration,
	expect_async_implementation: boolean|null
) : string {
	if (2 > implementation.parameters.length) return "implementation must have at least 2 parameters."

	const [context_param, deps_param] = implementation.parameters

	if (!context_param.type || !deps_param.type) {
		return "context or dependencies parameter does not have a type"
	}

	const context_param_type = context_param.type.getText(source)
	const deps_param_type = deps_param.type.getText(source)

	if (context_param_type !== "ContextInstance") {
		return "context parameter must be of type ContextInstance"
	} else if (deps_param_type !== "AnioJsDependencies") {
		return "dependencies parameter must be of type AnioJsDependencies"
	}

	const modifiers = _functionModifiersToString(source, implementation)

	if (expect_async_implementation === true && !modifiers.includes("async")) {
		return "expected async implementation, but got sync implementation instead"
	} else if (expect_async_implementation === false && modifiers.includes("async")) {
		return "expected sync implementation, but got async implementation instead"
	}

	return ""
}

function error(str: string) {
	return {
		factory: `/* ${str} */\n`,
		fn: `/* ${str} */\n`
	}
}

export async function tsGenerateFunctionFactoryCode(
	source: TsGenerateFunctionFactoryCodeSource,
	code: string,
	expect_async_implementation: boolean|null
) : Promise<{
	factory: string,
	fn: string
}> {
	const source_file : string = source.source
	const factory_name : string = path.basename(source.output.factory).slice(0, -4)
	const function_name : string = path.basename(source.output.fn).slice(0, -4)

	let factory = ``
	const ts_ast = await _createASTFromCode(code)
	const implementation = await _isolateExportedFunction(ts_ast, "implementation")

	if (!implementation) return error("unable to find implementation export")

	{
		const tmp = _checkImplementation(
			ts_ast,
			implementation,
			expect_async_implementation
		)

		if (tmp.length) return error(tmp)
	}

	const function_types = await _isolateTypesUsedInFunction(ts_ast, implementation)
	const resolved_types = await _resolveUsedTypesInFunction(ts_ast, function_types)

	const anio_js_dependency_map : AnioJsDependencyMap = await _getDeclaredAnioSoftwareDependencies(ts_ast)

	const function_signature = _generateFunctionSignature(ts_ast, implementation)

	factory += `import {useContext, type UserContext} from "@fourtune/realm-js/v0/runtime"\n`
	factory += `import {getProject} from "@fourtune/realm-js/v0/project"\n`
	factory += `import type {AnioJsDependencies} from "${source_file}"\n`
	factory += `import {implementation} from "${source_file}"\n`

	for (const [k, v] of _sortResolvedEntries(resolved_types)) {
		if (v.source === "unknown") {
			factory += `// unresolved type "${k}"\n`

			continue
		}

		if (k === "AnioJsDependencies") continue

		factory += `${v.definition()}\n`
	}

	factory += `\n`
	factory += function_signature
	factory += `\n`
	factory += _generateFactoryFunction(
		factory_name,
		function_name,
		ts_ast,
		implementation,
		anio_js_dependency_map
	)

	return {
		factory,
		fn: ""
	}
}
