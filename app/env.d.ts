declare module 'video-name-parser' {
	export interface VideoInterface {
		name: string
		season?: number
		episode?: number[]
		type?: string
		tag?: string[]
	}

	export default function parseVideo(name: string): VideoInterface
}
