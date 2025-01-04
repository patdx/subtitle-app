export const BadgeRed = (props: { children: any }) =>
	props.children ? (
		<span className="inline-flex items-center justify-center rounded-full bg-red-600 px-2 py-1 text-xs font-bold leading-none text-white">
			{props.children}
		</span>
	) : null

export const BadgeBlue = (props: { children: any }) =>
	props.children ? (
		<span className="inline-flex items-center justify-center rounded-full bg-blue-600 px-2 py-1 text-xs font-bold leading-none text-white">
			{props.children}
		</span>
	) : null
