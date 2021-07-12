/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as extpath from 'vs/base/common/extpath';
import * as paths from 'vs/base/common/path';
import { URI, uriToFsPath } from 'vs/base/common/uri';
import { compare as strCompare } from 'vs/base/common/strings';
import { Schemas } from 'vs/base/common/network';
import { CharCode } from 'vs/base/common/charCode';

export function originalFSPath(uri: URI): string {
	return uriToFsPath(uri, true);
}

//#region IExtUri

export interface IExtUri {
}

export class ExtUri implements IExtUri {

	constructor(private _ignorePathCasing: (uri: URI) => boolean) { }

	compare(uri1: URI, uri2: URI, ignoreFragment: boolean = false): number {
		if (uri1 === uri2) {
			return 0;
		}
		return strCompare(this.getComparisonKey(uri1, ignoreFragment), this.getComparisonKey(uri2, ignoreFragment));
	}

	isEqual(uri1: URI | undefined, uri2: URI | undefined, ignoreFragment: boolean = false): boolean {
		if (uri1 === uri2) {
			return true;
		}
		if (!uri1 || !uri2) {
			return false;
		}
		return this.getComparisonKey(uri1, ignoreFragment) === this.getComparisonKey(uri2, ignoreFragment);
	}

	getComparisonKey(uri: URI, ignoreFragment: boolean = false): string {
		return uri.with({
			path: this._ignorePathCasing(uri) ? uri.path.toLowerCase() : undefined,
			fragment: ignoreFragment ? null : undefined
		}).toString();
	}

	// --- path math

	joinPath(resource: URI, ...pathFragment: string[]): URI {
		return URI.joinPath(resource, ...pathFragment);
	}

	basenameOrAuthority(resource: URI): string {
		return basename(resource) || resource.authority;
	}

	basename(resource: URI): string {
		return paths.posix.basename(resource.path);
	}

	dirname(resource: URI): URI {
		if (resource.path.length === 0) {
			return resource;
		}
		let dirname;
		if (resource.scheme === Schemas.file) {
			dirname = URI.file(paths.dirname(originalFSPath(resource))).path;
		} else {
			dirname = paths.posix.dirname(resource.path);
			if (resource.authority && dirname.length && dirname.charCodeAt(0) !== CharCode.Slash) {
				console.error(`dirname("${resource.toString})) resulted in a relative path`);
				dirname = '/'; // If a URI contains an authority component, then the path component must either be empty or begin with a CharCode.Slash ("/") character
			}
		}
		return resource.with({
			path: dirname
		});
	}

	normalizePath(resource: URI): URI {
		if (!resource.path.length) {
			return resource;
		}
		let normalizedPath: string;
		if (resource.scheme === Schemas.file) {
			normalizedPath = URI.file(paths.normalize(originalFSPath(resource))).path;
		} else {
			normalizedPath = paths.posix.normalize(resource.path);
		}
		return resource.with({
			path: normalizedPath
		});
	}

	resolvePath(base: URI, path: string): URI {
		if (base.scheme === Schemas.file) {
			const newURI = URI.file(paths.resolve(originalFSPath(base), path));
			return base.with({
				authority: newURI.authority,
				path: newURI.path
			});
		}
		path = extpath.toPosixPath(path); // we allow path to be a windows path
		return base.with({
			path: paths.posix.resolve(base.path, path)
		});
	}
}


/**
 * Unbiased utility that takes uris "as they are". This means it can be interchanged with
 * uri#toString() usages. The following is true
 * ```
 * assertEqual(aUri.toString() === bUri.toString(), exturi.isEqual(aUri, bUri))
 * ```
 */
export const extUri = new ExtUri(() => false);

export const isEqual = extUri.isEqual.bind(extUri);
export const basenameOrAuthority = extUri.basenameOrAuthority.bind(extUri);
export const basename = extUri.basename.bind(extUri);
export const dirname = extUri.dirname.bind(extUri);
export const joinPath = extUri.joinPath.bind(extUri);
export const normalizePath = extUri.normalizePath.bind(extUri);
export const resolvePath = extUri.resolvePath.bind(extUri);

/**
 * Data URI related helpers.
 */
export namespace DataUri {

	export const META_DATA_LABEL = 'label';
	export const META_DATA_DESCRIPTION = 'description';
	export const META_DATA_SIZE = 'size';
	export const META_DATA_MIME = 'mime';

	export function parseMetaData(dataUri: URI): Map<string, string> {
		const metadata = new Map<string, string>();

		// Given a URI of:  data:image/png;size:2313;label:SomeLabel;description:SomeDescription;base64,77+9UE5...
		// the metadata is: size:2313;label:SomeLabel;description:SomeDescription
		const meta = dataUri.path.substring(dataUri.path.indexOf(';') + 1, dataUri.path.lastIndexOf(';'));
		meta.split(';').forEach(property => {
			const [key, value] = property.split(':');
			if (key && value) {
				metadata.set(key, value);
			}
		});

		// Given a URI of:  data:image/png;size:2313;label:SomeLabel;description:SomeDescription;base64,77+9UE5...
		// the mime is: image/png
		const mime = dataUri.path.substring(0, dataUri.path.indexOf(';'));
		if (mime) {
			metadata.set(META_DATA_MIME, mime);
		}

		return metadata;
	}
}
