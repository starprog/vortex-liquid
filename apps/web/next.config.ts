import type { NextConfig } from "next";
import { withBotId } from "botid/next/config";
import { withContentCollections } from "@content-collections/next";

const rawBasePath = process.env.OPENCUT_BASE_PATH?.trim() ?? "";
const normalizedBasePath = rawBasePath
	? `/${rawBasePath.replace(/^\/+/, "").replace(/\/+$/, "")}`
	: "";
const basePath = normalizedBasePath === "/" ? "" : normalizedBasePath;

const nextConfig: NextConfig = {
	basePath: basePath || undefined,
	assetPrefix: basePath || undefined,
	// basePath/assetPrefix only rewrite Next's own asset handling; expose the
	// value so client code can prefix its own hardcoded fetch()/url() paths.
	env: {
		NEXT_PUBLIC_BASE_PATH: basePath,
	},
	compiler: {
		removeConsole: process.env.NODE_ENV === "production",
	},
	typescript: {
		ignoreBuildErrors: true,
	},
	reactStrictMode: true,
	productionBrowserSourceMaps: true,
	output: "standalone",
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "plus.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.unsplash.com",
			},
			{
				protocol: "https",
				hostname: "images.marblecms.com",
			},
			{
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "api.iconify.design",
			},
			{
				protocol: "https",
				hostname: "api.simplesvg.com",
			},
			{
				protocol: "https",
				hostname: "api.unisvg.com",
			},
			{
				protocol: "https",
				hostname: "cdn.brandfetch.io",
			},
		],
	},
};

export default withContentCollections(withBotId(nextConfig));
