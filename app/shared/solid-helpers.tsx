import * as mobx from 'mobx'
import { observer } from 'mobx-react-lite'

type GetterFn<T> = () => T
type SetterFn<T> = (valueOrUpdater: T | ((prev: T) => T)) => void

export function useSignal<T>(initialValue: T): [GetterFn<T>, SetterFn<T>] {
	const [val] = useState(() => mobx.observable.box(initialValue))

	const getValue = () => val.get()
	const setValue: SetterFn<T> = (valueOrUpdater) => {
		console.log('setValue', valueOrUpdater)
		if (typeof valueOrUpdater === 'function') {
			const updater = valueOrUpdater as (prev: T) => T
			const nextValue = updater(val.get())
			console.log('nextValue', nextValue)
			val.set(nextValue)
		} else {
			val.set(valueOrUpdater)
		}
	}

	return [getValue, setValue] as const
}

export const Show = observer(function Show({
	when,
	children,
}: {
	when: () => boolean
	children: React.ReactNode
}) {
	const result = when()
	if (!result) {
		return null
	} else {
		return <>{children}</>
	}
})

let For = function For<T>({
	each,
	children,
}: {
	each: () => T[] | null | undefined
	children: (item: T, index: number) => React.ReactNode
}) {
	const items = each()?.map((item, index) => children(item, index))

	return <>{items}</>
}

// apply it this way to avoid typescript generic complexity
For = observer(For)

export { For }
