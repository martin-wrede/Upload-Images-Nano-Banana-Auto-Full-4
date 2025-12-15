// functions/list-images.js

export async function onRequest({ request, env }) {
    // ✅ CORS Preflight Handling
    if (request.method === "OPTIONS") {
        return new Response(null, {
            status: 204,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
        });
    }

    // ✅ Only accept POST
    if (request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        const { email } = await request.json();

        if (!email) {
            return new Response(
                JSON.stringify({ error: "Email is required" }),
                {
                    status: 400,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    }
                }
            );
        }

        // Sanitize email to folder name (same logic as upload)
        const safeEmail = email.replace(/[^a-zA-Z0-9]/g, '_');
        const folderPrefix = `${safeEmail}/`;

        console.log(`📂 Listing images from folder: ${folderPrefix}`);

        // List objects in R2 bucket with prefix
        const listed = await env.IMAGE_BUCKET.list({
            prefix: folderPrefix,
            limit: 1000, // Adjust as needed
        });

        // Filter for image files only
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const images = listed.objects
            .filter(obj => {
                const ext = obj.key.toLowerCase().substring(obj.key.lastIndexOf('.'));
                return imageExtensions.includes(ext);
            })
            .map(obj => ({
                key: obj.key,
                url: `${env.R2_PUBLIC_URL}/${obj.key}`,
                filename: obj.key.split('/').pop(), // Get filename from key
                size: obj.size,
                uploaded: obj.uploaded,
            }));

        console.log(`✅ Found ${images.length} images in ${folderPrefix}`);

        return new Response(
            JSON.stringify({
                images: images,
                count: images.length,
                folder: folderPrefix
            }),
            {
                status: 200,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );

    } catch (error) {
        console.error("❌ Error listing images:", error);
        return new Response(
            JSON.stringify({ error: error.message }),
            {
                status: 500,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            }
        );
    }
}
