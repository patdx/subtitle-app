import { createEffect, createSignal, Match, Switch, untrack } from 'solid-js'
import clsx from 'clsx'
import { isNil, times } from 'lodash-es'

export const NumberInput = (props: {
	value?: number
	onChange?: (value: number) => unknown
	suffix?: string
	padWidth?: number
	widthClass?: string
}) => {
	const [mode, setMode] = createSignal('view')
	const [ref, setRef] = createSignal<HTMLInputElement>()

	const value = () =>
		typeof props.value === 'string'
			? props.value
			: typeof props.value === 'number'
				? String(props.value)
				: ''

	createEffect(() => {
		const el = ref()
		if (el) {
			el.focus()
			el.select()
		}
	})

	const widthClass = () => props.widthClass ?? 'w-10'

	return (
		<Switch>
			<Match when={mode() === 'edit'}>
				<input
					ref={setRef}
					value={untrack(value)}
					type="text"
					inputMode="numeric"
					class={clsx(
						`form-input h-10 px-0 py-1 text-center tabular-nums`,
						widthClass(),
					)}
					onKeyDown={(event) => {
						console.log('keyup', event.key)
						if (event.key === 'Enter' || event.key === 'Escape') {
							setMode('view')
						}
					}}
					onBlur={(event) => {
						// compare the normalized values
						// to see if anything changed
						const oldValue = value()
						const newValue = (event.target as HTMLInputElement).value
						const parsed = isNil(newValue) ? undefined : parseInt(newValue, 10)

						if (
							oldValue !== newValue &&
							Number.isFinite(parsed) &&
							!isNil(parsed)
						) {
							props.onChange?.(parsed)
						}

						setMode('view')
					}}
				/>
			</Match>
			<Match when={mode() === 'view'}>
				<button
					class={clsx(
						'h-10 px-0 py-1 text-center tabular-nums text-gray-200 hover:text-white active:text-white',
						widthClass(),
					)}
					// classList={{
					//   [widthClass]: true,
					// }}
					onClick={() => setMode('edit')}
				>
					<ValueWithPlaceholder padWidth={props.padWidth} value={value()} />
					<span>{props.suffix}</span>
				</button>
			</Match>
		</Switch>
	)
}

export const ValueWithPlaceholder = (props: {
	padWidth?: number
	value?: string | number
}) => {
	const remaining = () => {
		const value = isNil(props.value) ? '' : String(props.value)
		const padWidth = props.padWidth ?? 0
		return Math.max(padWidth - value.length, 0)
	}
	return (
		<>
			<span class="invisible">{times(remaining(), () => '0').join('')}</span>
			<span>{props.value}</span>
		</>
	)
}
