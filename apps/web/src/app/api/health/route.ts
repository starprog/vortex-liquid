export async function GET() {
	// Reports which environment this container was started with, independent of hostname.
	return Response.json({ status: "ok", environment: process.env.APP_ENV ?? "unknown" });
}
