#!/usr/bin/env node
// Generates app/assets/sample.srt — a ~30 minute subtitle track for testing.
// Dense, varied lines so the timeline scrubber, transcript, and seek buttons
// all have something realistic to work with.

const LINES = [
	'This is a third subtitle.',
	'The quick brown fox jumps over the lazy dog.',
	'She sells sea shells by the sea shore.',
	'How much wood would a woodchuck chuck?',
	'Peter Piper picked a peck of pickled peppers.',
	'All that glitters is not gold.',
	'A journey of a thousand miles begins with a single step.',
	'To be or not to be, that is the question.',
	'The only thing we have to fear is fear itself.',
	'That which does not kill us makes us stronger.',
	'Life is what happens when you are busy making other plans.',
	'Not all those who wander are lost.',
	'It does not matter how slowly you go as long as you do not stop.',
	'Success is not final, failure is not fatal: it is the courage to continue that counts.',
	'The future belongs to those who believe in the beauty of their dreams.',
	'Do not go where the path may lead, go instead where there is no path and leave a trail.',
	'Whether you think you can or you think you cannot, you are right.',
	'The best time to plant a tree was twenty years ago. The second best time is now.',
	'It always seems impossible until it is done.',
	'You miss one hundred percent of the shots you do not take.',
	'Innovation distinguishes between a leader and a follower.',
	'The greatest glory in living lies not in never falling, but in rising every time we fall.',
	'Believe you can and you are halfway there.',
	'The purpose of our lives is to be happy.',
	'Get busy living or get busy dying.',
	'You only live once, but if you do it right, once is enough.',
	'In three words I can sum up everything I have learned about life: it goes on.',
	'Your time is limited, so do not waste it living someone else life.',
	'The way to get started is to quit talking and begin doing.',
	'If you look at what you have in life, you will always have more.',
	'When you reach the end of your rope, tie a knot in it and hang on.',
	'Always remember that you are absolutely unique, just like everyone else.',
	'Do not let yesterday take up too much of today.',
	'If you tell the truth, you do not have to remember anything.',
	'The secret of getting ahead is getting started.',
	'Life is really simple, but we insist on making it complicated.',
	'The only way to do great work is to love what you do.',
	'If you can dream it, you can achieve it.',
	'Don not watch the clock; do what it does. Keep going.',
	'Everything you have ever wanted is on the other side of fear.',
]

const DURATION_MS = 30 * 60 * 1000 // 30 minutes
const GAP_MS = 400

// Each line is spoken over ~4s with a pause between cues.
const CUE_LENGTH_MS = 4000
const STEP_MS = CUE_LENGTH_MS + GAP_MS

const toTimestamp = (ms) => {
	const pad = (n, w = 2) => String(n).padStart(w, '0')
	const h = Math.floor(ms / 3600000)
	const m = Math.floor((ms % 3600000) / 60000)
	const s = Math.floor((ms % 60000) / 1000)
	const milli = ms % 1000
	return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`
}

let out = ''
let index = 1
let cue = 0

for (let t = 0; t < DURATION_MS; t += STEP_MS) {
	const start = t
	const end = Math.min(t + CUE_LENGTH_MS, DURATION_MS)
	const line = LINES[cue % LINES.length]
	out += `${index}\n${toTimestamp(start)} --> ${toTimestamp(end)}\n${line}\n\n`
	index += 1
	cue += 1
}

process.stdout.write(out)
