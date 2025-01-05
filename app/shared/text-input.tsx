import { isNil, times } from 'lodash-es'
import { observer } from 'mobx-react-lite'

export const NumberInput = observer(
	(props: {
		value: () => number
		onChange?: (value: number) => unknown
		suffix?: string
		padWidth?: number
		className?: string
	}) => {
		const [mode, setMode] = useSignal('view')

		const resolved = props.value()

		const value = () =>
			typeof resolved === 'string'
				? resolved
				: typeof resolved === 'number'
					? String(resolved)
					: ''

		function commit(el: HTMLInputElement) {
			// compare the normalized values
			// to see if anything changed
			const oldValue = value()
			const newValue = el.value
			const parsed = isNil(newValue) ? undefined : parseInt(newValue, 10)

			console.log('old', oldValue, 'new', newValue)

			if (oldValue !== newValue && Number.isFinite(parsed) && !isNil(parsed)) {
				props.onChange?.(parsed)
			}

			setMode('view')
		}

		if (mode() === 'edit') {
			return (
				<input
					ref={(el) => {
						if (el) {
							console.log('focusing', el)
							el.focus()
							el.select()
						}
					}}
					defaultValue={value()}
					type="text"
					inputMode="numeric"
					className={cn(
						`form-input h-10 px-0 py-1 text-center tabular-nums`,
						'w-10',
						props.className,
					)}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === 'Escape') {
							commit(event.target as HTMLInputElement)
						}
					}}
					onBlur={(event) => {
						commit(event.target as HTMLInputElement)
					}}
				/>
			)
		} else if (mode() === 'view') {
			return (
				<button
					className={cn(
						'h-10 px-0 py-1 text-center tabular-nums text-gray-200 hover:text-white active:text-white',
						'w-10',
						props.className,
					)}
					// classList={{
					//   [widthClass]: true,
					// }}
					onClick={() => setMode('edit')}
				>
					<ValueWithPlaceholder padWidth={props.padWidth} value={value()} />
					<span>{props.suffix}</span>
				</button>
			)
		}
	},
)

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
			<span className="invisible">
				{times(remaining(), () => '0').join('')}
			</span>
			<span>{props.value}</span>
		</>
	)
}
