/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import BaseSeverity from 'vs/base/common/severity';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IDisposable } from 'vs/base/common/lifecycle';

export import Severity = BaseSeverity;

export const INotificationService = createDecorator<INotificationService>('notificationService');

export type NotificationMessage = string | Error;

export interface INotificationProperties {
}

export interface INotification extends INotificationProperties {

	/**
	 * The severity of the notification. Either `Info`, `Warning` or `Error`.
	 */
	readonly severity: Severity;

	/**
	 * The message of the notification. This can either be a `string` or `Error`. Messages
	 * can optionally include links in the format: `[text](link)`
	 */
	readonly message: NotificationMessage;
}

export interface INotificationHandle {
}

export interface IStatusMessageOptions {

	/**
	 * An optional timeout after which the status message is to be hidden. By default
	 * the status message will not hide until another status message is displayed.
	 */
	readonly hideAfter?: number;
}

/**
 * A service to bring up notifications and non-modal prompts.
 *
 * Note: use the `IDialogService` for a modal way to ask the user for input.
 */
export interface INotificationService {

	readonly _serviceBrand: undefined;

	/**
	 * A convenient way of reporting infos. Use the `INotificationService.notify`
	 * method if you need more control over the notification.
	 */
	info(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * A convenient way of reporting warnings. Use the `INotificationService.notify`
	 * method if you need more control over the notification.
	 */
	warn(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * A convenient way of reporting errors. Use the `INotificationService.notify`
	 * method if you need more control over the notification.
	 */
	error(message: NotificationMessage | NotificationMessage[]): void;

	/**
	 * Shows a status message in the status area with the provided text.
	 *
	 * @param message the message to show as status
	 * @param options provides some optional configuration options
	 *
	 * @returns a disposable to hide the status message
	 */
	status(message: NotificationMessage, options?: IStatusMessageOptions): IDisposable;
}

export class NoOpNotification implements INotificationHandle {
}
