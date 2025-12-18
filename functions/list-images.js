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
        const body = await request.json();
        const email = body.email;
        const folder = body.folder; // optional: 'base' | 'down' | 'all'

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

        // Determine which prefixes to search based on optional 'folder' param (base/down/all)
        let prefixes;
        if (folder === 'base') {
            prefixes = [`${safeEmail}/`];
        } else if (folder === 'down') {
            prefixes = [`${safeEmail}_down/`];
        } else {
            prefixes = [`${safeEmail}_down/`, `${safeEmail}/`, `${safeEmail}_`];
        }
        console.log(`🔎 Searching R2 with prefixes: ${prefixes.join(', ')} (requested folder: ${folder || 'all'})`);

        let allObjects = [];
        for (const prefix of prefixes) {
            try {
                const listed = await env.IMAGE_BUCKET.list({
                    prefix: prefix,
                    limit: 1000,
                });
                if (listed.objects && listed.objects.length > 0) {
                    allObjects = allObjects.concat(listed.objects);
                }
            } catch (err) {
                console.warn(`⚠️ Error listing prefix ${prefix}:`, err);
            }
        }

        // Deduplicate objects by key
        const uniqueMap = new Map();
        for (const obj of allObjects) {
            uniqueMap.set(obj.key, obj);
        }
        const uniqueObjects = Array.from(uniqueMap.values());

        // Filter for image files only, add upload timestamp, cache-busting param, then sort newest-first
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

        const basePublicUrl = env.R2_PUBLIC_URL || 'https://pub-2e08632872a645f89f91aad5f2904c70.r2.dev';

        const images = uniqueObjects
            .filter(obj => {
                const idx = obj.key.lastIndexOf('.');
                const ext = idx !== -1 ? obj.key.toLowerCase().substring(idx) : '';
                return imageExtensions.includes(ext);
            })
            .map(obj => {
                // derive a numeric timestamp for sorting & cache-busting
                let uploadedAt = Date.now();
                try {
                    if (obj.uploaded) {
                        // obj.uploaded may be a Date or string
                        if (typeof obj.uploaded === 'string') uploadedAt = Date.parse(obj.uploaded) || uploadedAt;
                        else if (obj.uploaded instanceof Date) uploadedAt = obj.uploaded.getTime();
                        else if (typeof obj.uploaded === 'number') uploadedAt = obj.uploaded;
                    }
                } catch (e) {
                    // ignore, use now
                }

                const filename = obj.key.split('/').pop(); // Get filename from key
                const url = `${basePublicUrl}/${obj.key}?v=${uploadedAt}`;

                return {
                    key: obj.key,
                    url,
                    filename,
                    size: obj.size,
                    uploaded: obj.uploaded,
                    uploadedAt
                };
            })
            // sort newest first
            .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0));

        console.log(`✅ Found ${images.length} images across prefixes: ${prefixes.join(', ')}`);

        return new Response(
            JSON.stringify({
                images: images,
                count: images.length,
                foldersChecked: prefixes
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
