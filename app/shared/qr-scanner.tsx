import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { once } from 'lodash-es'
import { Button } from '~/components/ui/button'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { buttonChrome, cn } from '~/shared/utils'

const loadJsQR = once(() => import('jsqr').then((mod) => mod.default))

const CAMERA_ERROR = 'Camera unavailable. Enter the code manually instead.'

/** Live QR scanning via getUserMedia + jsQR; emits the scanned code. */
export const QrScanner = (props: { onScan: (code: string) => void }) => {
	const videoRef = useRef<HTMLVideoElement>(null)
	const [active, setActive] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const onScan = useEffectEvent((code: string) => props.onScan(code))

	useEffect(() => {
		if (!active) return

		let stream: MediaStream | null = null
		let cancelled = false
		let raf = 0

		const fail = () => {
			cancelled = true
			cancelAnimationFrame(raf)
			stream?.getTracks().forEach((track) => track.stop())
			stream = null
			setActive(false)
			setError(CAMERA_ERROR)
		}

		const stop = () => {
			cancelled = true
			cancelAnimationFrame(raf)
			stream?.getTracks().forEach((track) => track.stop())
			stream = null
			setActive(false)
		}

		const handleCode = (data: string) => {
			try {
				const code = new URL(data).searchParams.get('code')
				if (code) {
					stop()
					onScan(code)
				}
			} catch {
				// not a URL with a code; keep scanning
			}
		}

		const tick = (
			video: HTMLVideoElement,
			ctx: CanvasRenderingContext2D,
			jsQR: (
				data: Uint8ClampedArray,
				w: number,
				h: number,
			) => {
				data?: string
			} | null,
			canvas: HTMLCanvasElement,
		) => {
			if (cancelled) return
			if (video.readyState === video.HAVE_ENOUGH_DATA) {
				canvas.width = video.videoWidth
				canvas.height = video.videoHeight
				ctx.drawImage(video, 0, 0)
				const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
				const result = jsQR(imageData.data, imageData.width, imageData.height)
				if (result?.data) {
					handleCode(result.data)
					return
				}
			}
			raf = requestAnimationFrame(() => tick(video, ctx, jsQR, canvas))
		}

		const start = async () => {
			try {
				stream = await navigator.mediaDevices.getUserMedia({
					video: { facingMode: { ideal: 'environment' } },
				})
				if (cancelled) {
					stream.getTracks().forEach((track) => track.stop())
					return
				}
				const video = videoRef.current
				if (!video) {
					fail()
					return
				}
				video.srcObject = stream
				await video.play()
				const jsQR = await loadJsQR()
				if (cancelled) return
				const canvas = document.createElement('canvas')
				const ctx = canvas.getContext('2d', { willReadFrequently: true })
				if (!ctx) {
					fail()
					return
				}
				tick(video, ctx, jsQR, canvas)
			} catch {
				fail()
			}
		}

		void start()
		return stop
	}, [active])

	return (
		<div className="flex flex-col items-center gap-2">
			{error && (
				<Alert variant="destructive" className="w-full">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<Button
				className={cn(buttonChrome, 'w-full')}
				onClick={() => {
					setError(null)
					setActive(true)
				}}
			>
				Scan a QR code
			</Button>
			{active &&
				createPortal(
					<div
						role="dialog"
						aria-modal="true"
						aria-label="Scan QR code"
						className="fixed inset-0 z-50 flex flex-col bg-black"
					>
						<video
							ref={videoRef}
							className="absolute inset-0 h-full w-full object-cover"
							muted
							playsInline
						/>
						<div className="relative mt-auto flex flex-col gap-3 bg-linear-to-t from-black/80 to-transparent px-4 pt-16 pb-safe-or-6">
							<p className="text-center text-sm text-white/80">
								Point at the QR code on the other device
							</p>
							<Button
								className={cn(buttonChrome, 'w-full')}
								onClick={() => setActive(false)}
							>
								Cancel
							</Button>
						</div>
					</div>,
					document.body,
				)}
		</div>
	)
}
