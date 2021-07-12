
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IQuickPickItem, IPickOptions, IQuickPick, QuickPickInput } from 'vs/base/parts/quickinput/common/quickInput';
import { IQuickAccessController } from 'vs/platform/quickinput/common/quickAccess';

export * from 'vs/base/parts/quickinput/common/quickInput';

export const IQuickInputService = createDecorator<IQuickInputService>('quickInputService');

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;

export interface IQuickInputService {

	readonly _serviceBrand: undefined;

	/**
	 * Provides access to the quick access providers.
	 */
	readonly quickAccess: IQuickAccessController;

	/**
	 * Opens the quick input box for selecting items and returns a promise
	 * with the user selected item(s) if any.
	 */
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: true }, token?: CancellationToken): Promise<T[] | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: IPickOptions<T> & { canPickMany: false }, token?: CancellationToken): Promise<T | undefined>;
	pick<T extends IQuickPickItem>(picks: Promise<QuickPickInput<T>[]> | QuickPickInput<T>[], options?: Omit<IPickOptions<T>, 'canPickMany'>, token?: CancellationToken): Promise<T | undefined>;

	/**
	 * Provides raw access to the quick pick controller.
	 */
	createQuickPick<T extends IQuickPickItem>(): IQuickPick<T>;
}
