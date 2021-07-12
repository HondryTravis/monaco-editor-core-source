/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from 'vs/base/common/platform';
import { startsWithIgnoreCase } from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';
import { sep, posix, normalize } from 'vs/base/common/path';

/**
 * Takes a Windows OS path and changes backward slashes to forward slashes.
 * This should only be done for OS paths from Windows (or user provided paths potentially from Windows).
 * Using it on a Linux or MaxOS path might change it.
 */
export function toSlashes(osPath: string) {
	return osPath.replace(/[\\/]/g, posix.sep);
}

/**
 * Takes a Windows OS path (using backward or forward slashes) and turns it into a posix path:
 * - turns backward slashes into forward slashes
 * - makes it absolute if it starts with a drive letter
 * This should only be done for OS paths from Windows (or user provided paths potentially from Windows).
 * Using it on a Linux or MaxOS path might change it.
 */
export function toPosixPath(osPath: string) {
	if (osPath.indexOf('/') === -1) {
		osPath = toSlashes(osPath);
	}
	if (/^[a-zA-Z]:(\/|$)/.test(osPath)) { // starts with a drive letter
		osPath = '/' + osPath;
	}
	return osPath;
}

export function isEqualOrParent(base: string, parentCandidate: string, ignoreCase?: boolean, separator = sep): boolean {
	if (base === parentCandidate) {
		return true;
	}

	if (!base || !parentCandidate) {
		return false;
	}

	if (parentCandidate.length > base.length) {
		return false;
	}

	if (ignoreCase) {
		const beginsWith = startsWithIgnoreCase(base, parentCandidate);
		if (!beginsWith) {
			return false;
		}

		if (parentCandidate.length === base.length) {
			return true; // same path, different casing
		}

		let sepOffset = parentCandidate.length;
		if (parentCandidate.charAt(parentCandidate.length - 1) === separator) {
			sepOffset--; // adjust the expected sep offset in case our candidate already ends in separator character
		}

		return base.charAt(sepOffset) === separator;
	}

	if (parentCandidate.charAt(parentCandidate.length - 1) !== separator) {
		parentCandidate += separator;
	}

	return base.indexOf(parentCandidate) === 0;
}

export function isWindowsDriveLetter(char0: number): boolean {
	return char0 >= CharCode.A && char0 <= CharCode.Z || char0 >= CharCode.a && char0 <= CharCode.z;
}

export function isRootOrDriveLetter(path: string): boolean {
	const pathNormalized = normalize(path);

	if (isWindows) {
		if (path.length > 3) {
			return false;
		}

		return hasDriveLetter(pathNormalized) &&
			(path.length === 2 || pathNormalized.charCodeAt(2) === CharCode.Backslash);
	}

	return pathNormalized === posix.sep;
}

export function hasDriveLetter(path: string): boolean {
	if (isWindows) {
		return isWindowsDriveLetter(path.charCodeAt(0)) && path.charCodeAt(1) === CharCode.Colon;
	}

	return false;
}
