/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { TernarySearchTree } from 'vs/base/common/map';
import { IStoredWorkspaceFolder } from 'vs/platform/workspaces/common/workspaces';
import { IWorkspaceFolderProvider } from 'vs/base/common/labels';

export const IWorkspaceContextService = createDecorator<IWorkspaceContextService>('contextService');

export interface IWorkspaceContextService extends IWorkspaceFolderProvider {

	readonly _serviceBrand: undefined;

	/**
	 * Provides access to the workspace object the window is running with.
	 * Use `getCompleteWorkspace` to get complete workspace object.
	 */
	getWorkspace(): IWorkspace;
}

export interface IWorkspace {

	/**
	 * the unique identifier of the workspace.
	 */
	readonly id: string;

	/**
	 * Folders in the workspace.
	 */
	readonly folders: IWorkspaceFolder[];

	/**
	 * the location of the workspace configuration
	 */
	readonly configuration?: URI | null;
}

export interface IWorkspaceFolderData {

	/**
	 * The associated URI for this workspace folder.
	 */
	readonly uri: URI;

	/**
	 * The name of this workspace folder. Defaults to
	 * the basename of its [uri-path](#Uri.path)
	 */
	readonly name: string;

	/**
	 * The ordinal number of this workspace folder.
	 */
	readonly index: number;
}

export interface IWorkspaceFolder extends IWorkspaceFolderData {
}

export class Workspace implements IWorkspace {

	private _foldersMap: TernarySearchTree<URI, WorkspaceFolder> = TernarySearchTree.forUris<WorkspaceFolder>(this._ignorePathCasing);
	private _folders!: WorkspaceFolder[];

	constructor(
		private _id: string,
		folders: WorkspaceFolder[],
		private _configuration: URI | null,
		private _ignorePathCasing: (key: URI) => boolean,
	) {
		this.folders = folders;
	}

	get folders(): WorkspaceFolder[] {
		return this._folders;
	}

	set folders(folders: WorkspaceFolder[]) {
		this._folders = folders;
		this.updateFoldersMap();
	}

	get id(): string {
		return this._id;
	}

	get configuration(): URI | null {
		return this._configuration;
	}

	set configuration(configuration: URI | null) {
		this._configuration = configuration;
	}

	getFolder(resource: URI): IWorkspaceFolder | null {
		if (!resource) {
			return null;
		}

		return this._foldersMap.findSubstr(resource.with({
			scheme: resource.scheme,
			authority: resource.authority,
			path: resource.path
		})) || null;
	}

	private updateFoldersMap(): void {
		this._foldersMap = TernarySearchTree.forUris<WorkspaceFolder>(this._ignorePathCasing);
		for (const folder of this.folders) {
			this._foldersMap.set(folder.uri, folder);
		}
	}

	toJSON(): IWorkspace {
		return { id: this.id, folders: this.folders, configuration: this.configuration };
	}
}

export class WorkspaceFolder implements IWorkspaceFolder {

	readonly uri: URI;
	name: string;
	index: number;

	constructor(data: IWorkspaceFolderData,
		readonly raw?: IStoredWorkspaceFolder) {
		this.uri = data.uri;
		this.index = data.index;
		this.name = data.name;
	}

	toJSON(): IWorkspaceFolderData {
		return { uri: this.uri, name: this.name, index: this.index };
	}
}
