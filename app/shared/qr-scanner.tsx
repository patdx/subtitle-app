import { useEffect, useRef, useState } from 'react'
import { Button } from '~/components'

/** Live QR scanning via getUserMedia + jsQR; emits the scanned code. */
export const QrScanner = (props: { onScan: (code: string) => void }) => {
	const videoRef = useRef<HTMLVideoElement>(null)
	const [active, setActive] = useState(false)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		if (!active) return

		let stream: MediaStream | null = null
		let cancelled = false
		let raf = 0

		const stop = () => {
			cancelled = true
			cancelAnimationFrame(raf)
			stream?.getTracks().forEach((track) => track.stop())
			setActive(false)
		}

		const handleCode = (data: string) => {
			try {
				const code = new URL(data).searchParams.get('code')
				if (code) {
					stop()
					props.onScan(code)
				}
			} catch {
				// not a URL with a code; keep scanning
			}
		}

		const tick = (
			video: HTMLVideoElement,
			ctx: CanvasRenderingContext2D,
			jsQR: (data: Uint8ClampedArray, w: number, h: number) => {
				data?: string
			} | null,
			canvas: HTMLCanvasElement,
		) => {
			if (cancelled) return
			if (video.readyState === video.HAVE_ENOUGH_DATA) {
				canvas.width = video.videoWidth
				canvas.height = video.videoHeight
				ctx.drawImage(video, 0, 0)
				const imageData = ctx.getImageData(
					0,
					0,
					canvas.width,
					canvas.height,
				)
				const result = jsQR(imageData.data, imageData.width, imageData.height)
				if (result?.data) {
					handleCode(result.data)
					return
				}
			}
			raf = requestAnimationFrame(() =>
				tick(video, ctx, jsQR, canvas),
			)
		}

		const start = async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: 'environment' },
				})
				if (cancelled) {
					stream.getTracks().forEach((track) => track.stop())
					return
				}
				const video = videoRef.current
				if (!video) return
				video.srcObject = stream
				await video.play()
				const { default: jsQR } = await import('jsqr')
				const canvas = document.createElement('canvas')
				const ctx = canvas.getContext('2d', { willReadFrequently: true })
				if (!ctx) return
				tick(video, ctx, jsQR, canvas)
			} catch (err) {
				setError('Camera unavailable. Enter the code manually instead.')
			}
		}

		void start()
		return stop
	}, [active])

	return (
		<div className="flex flex-col items-center gap-2">
			{active && (
				<video
					ref={videoRef}
					className="hidden"
					muted
					playsInline
				/>
			)}
			{error && <p className="text-sm text-red-600">{error}</p>}
			<Button
				className="w-full"
				onClick={() => {
					setError(null)
					setActive((value) => !value)
				}}
			>
				{active ? 'Stop scanning' : 'Scan a QR code'}
			</Button>
		</div>
	)
}
