
import { IWorkspace } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';

export const WORKSPACE_EXTENSION = 'code-workspace';

//#endregion

//#region Identifiers / Payload

export interface IBaseWorkspaceIdentifier {

	/**
	 * Every workspace (multi-root, single folder or empty)
	 * has a unique identifier. It is not possible to open
	 * a workspace with the same `id` in multiple windows
	 */
	id: string;
}

/**
 * A single folder workspace identifier is a path to a folder + id.
 */
export interface ISingleFolderWorkspaceIdentifier extends IBaseWorkspaceIdentifier {

	/**
	 * Folder path as `URI`.
	 */
	uri: URI;
}

export function isSingleFolderWorkspaceIdentifier(obj: unknown): obj is ISingleFolderWorkspaceIdentifier {
	const singleFolderIdentifier = obj as ISingleFolderWorkspaceIdentifier | undefined;

	return typeof singleFolderIdentifier?.id === 'string' && URI.isUri(singleFolderIdentifier.uri);
}

/**
 * A multi-root workspace identifier is a path to a workspace file + id.
 */
export interface IWorkspaceIdentifier extends IBaseWorkspaceIdentifier {

	/**
	 * Workspace config file path as `URI`.
	 */
	configPath: URI;
}

export function toWorkspaceIdentifier(workspace: IWorkspace): IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | undefined {

	// Multi root
	if (workspace.configuration) {
		return {
			id: workspace.id,
			configPath: workspace.configuration
		};
	}

	// Single folder
	if (workspace.folders.length === 1) {
		return {
			id: workspace.id,
			uri: workspace.folders[0].uri
		};
	}

	// Empty workspace
	return undefined;
}

export interface IRawFileWorkspaceFolder {
}

export interface IRawUriWorkspaceFolder {
}

export type IStoredWorkspaceFolder = IRawFileWorkspaceFolder | IRawUriWorkspaceFolder;

//#endregion
