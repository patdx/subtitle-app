import { AsyncLocalStorage } from 'node:async_hooks'

export interface MyCloudflareEnvironment {
	VALUE_FROM_CLOUDFLARE: string
}

export interface MyAppLoadContext {
	request: Request
	env: MyCloudflareEnvironment
	executionCtx: ExecutionContext
	[key: string]: unknown
}

declare module 'react-router' {
	interface AppLoadContext extends MyAppLoadContext {}
}

export const MyAppLoadContext = new AsyncLocalStorage<MyAppLoadContext>()

export function getMyAppLoadContext() {
	const ctx = MyAppLoadContext.getStore()
	if (!ctx) throw new Error('MyAppLoadContext not found')
	return ctx
}
