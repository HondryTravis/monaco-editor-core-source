/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from 'vs/base/common/buffer';
import { URI, UriComponents } from 'vs/base/common/uri';

export function parse(text: string): any {
	let data = JSON.parse(text);
	data = revive(data);
	return data;
}

export interface MarshalledObject {
	$mid: number;
}


type Deserialize<T> = T extends UriComponents ? URI
	: T extends object
	? Revived<T>
	: T;

export type Revived<T> = { [K in keyof T]: Deserialize<T[K]> };

export function revive<T = any>(obj: any, depth = 0): Revived<T> {
	if (!obj || depth > 200) {
		return obj;
	}

	if (typeof obj === 'object') {

		switch ((<MarshalledObject>obj).$mid) {
			case 1: return <any>URI.revive(obj);
			case 2: return <any>new RegExp(obj.source, obj.flags);
		}

		if (
			obj instanceof VSBuffer
			|| obj instanceof Uint8Array
		) {
			return <any>obj;
		}

		if (Array.isArray(obj)) {
			for (let i = 0; i < obj.length; ++i) {
				obj[i] = revive(obj[i], depth + 1);
			}
		} else {
			// walk object
			for (const key in obj) {
				if (Object.hasOwnProperty.call(obj, key)) {
					obj[key] = revive(obj[key], depth + 1);
				}
			}
		}
	}

	return obj;
}
