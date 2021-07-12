/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from 'vs/base/common/uri';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';

export const ILabelService = createDecorator<ILabelService>('labelService');

export interface ILabelService {

	readonly _serviceBrand: undefined;

	/**
	 * Gets the human readable label for a uri.
	 * If relative is passed returns a label relative to the workspace root that the uri belongs to.
	 * If noPrefix is passed does not tildify the label and also does not prepand the root name for relative labels in a multi root scenario.
	 */
	getUriLabel(resource: URI, options?: { relative?: boolean, noPrefix?: boolean, endWithSeparator?: boolean }): string;
}
