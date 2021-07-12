/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IModelDecoration } from 'vs/editor/common/model';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IMarker } from 'vs/platform/markers/common/markers';
import { URI } from 'vs/base/common/uri';

export const IMarkerDecorationsService = createDecorator<IMarkerDecorationsService>('markerDecorationsService');

export interface IMarkerDecorationsService {
	readonly _serviceBrand: undefined;

	getMarker(uri: URI, decoration: IModelDecoration): IMarker | null;
}
