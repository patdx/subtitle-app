import clsx from 'clsx'
import { getTextSize, getTimeElapsed, nodeIsActive, type Entry } from '../utils'

export const Subtitle = (props: { node: Entry }) => {
	return (
		<div
			class={clsx(
				`text-white`,
				getTextSize(),
				nodeIsActive(props.node, getTimeElapsed()) && 'font-bold',
			)}
			innerHTML={props.node.text}
		/>
	)
}
