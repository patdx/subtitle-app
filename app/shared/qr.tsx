import { useEffect, useState } from 'react'

export const QrCode = (props: { value: string; size?: number }) => {
	const [svg, setSvg] = useState<string | null>(null)

	useEffect(() => {
		let cancelled = false

		import('qrcode')
			.then(({ default: QRCode }) =>
				QRCode.toString(props.value, {
					type: 'svg',
					width: props.size ?? 256,
					margin: 1,
					errorCorrectionLevel: 'M',
				}),
			)
			.then((svgString) => {
				if (!cancelled) setSvg(svgString)
			})
			.catch(() => {
				// QR generation failed; fall back to showing the code text only
			})

		return () => {
			cancelled = true
		}
	}, [props.value, props.size])

	if (!svg) return null

	return <div dangerouslySetInnerHTML={{ __html: svg }} />
}
