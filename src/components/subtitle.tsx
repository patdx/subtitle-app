import type { Entry } from '@plussub/srt-vtt-parser/dist/src/types'
import clsx from 'clsx'
import { getTextSize, getTimeElapsed, nodeIsActive } from '../utils'

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
