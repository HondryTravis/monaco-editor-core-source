/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { isWindows } from 'vs/base/common/platform';
import { basename } from 'vs/base/common/resources';
import { hasDriveLetter, isRootOrDriveLetter } from 'vs/base/common/extpath';

export interface IWorkspaceFolderProvider {
}

export function getBaseLabel(resource: URI | string): string;
export function getBaseLabel(resource: URI | string | undefined): string | undefined;
export function getBaseLabel(resource: URI | string | undefined): string | undefined {
	if (!resource) {
		return undefined;
	}

	if (typeof resource === 'string') {
		resource = URI.file(resource);
	}

	const base = basename(resource) || (resource.scheme === Schemas.file ? resource.fsPath : resource.path) /* can be empty string if '/' is passed in */;

	// convert c: => C:
	if (isWindows && isRootOrDriveLetter(base)) {
		return normalizeDriveLetter(base);
	}

	return base;
}

export function normalizeDriveLetter(path: string): string {
	if (hasDriveLetter(path)) {
		return path.charAt(0).toUpperCase() + path.slice(1);
	}

	return path;
}
