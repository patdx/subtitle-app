import { getTextSize, getTimeElapsed, nodeIsActive, type Entry } from './utils'
import { observer } from 'mobx-react-lite'

export const Subtitle = observer((props: { node: Entry }) => {
	// TODO: decide active node more efficiently
	return (
		<div
			className={cn(
				`text-white`,
				getTextSize(),
				nodeIsActive(props.node, getTimeElapsed()) && 'font-bold',
			)}
			dangerouslySetInnerHTML={{ __html: props.node.text }}
		/>
	)
})
