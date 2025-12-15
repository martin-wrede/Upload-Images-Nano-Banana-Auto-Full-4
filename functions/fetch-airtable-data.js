// functions/fetch-airtable-data.js

export async function onRequest({ request, env }) {
    // CORS Preflight Handling
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

    // Accept both GET and POST
    if (request.method !== "GET" && request.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        // Parse optional filters from request body (if POST)
        let filters = {};
        if (request.method === "POST") {
            try {
                filters = await request.json();
            } catch (e) {
                // If no body or invalid JSON, use empty filters
                filters = {};
            }
        }

        // Build Airtable URL for the second table
        const airtableUrl = `https://api.airtable.com/v0/${env.AIRTABLE_BASE_ID1}/${env.AIRTABLE_TABLE_NAME1}`;

        // Build filter formula if email filter is provided
        let url = airtableUrl;
        if (filters.email) {
            const filterFormula = `{Email} = '${filters.email}'`;
            const encodedFormula = encodeURIComponent(filterFormula);
            url = `${airtableUrl}?filterByFormula=${encodedFormula}`;
        }

        // Add sorting by timestamp (newest first)
        const sortParam = encodeURIComponent('sort[0][field]') + '=Timestamp&' +
            encodeURIComponent('sort[0][direction]') + '=desc';
        url += (url.includes('?') ? '&' : '?') + sortParam;

        console.log('📡 Fetching from Airtable:', url);

        // Fetch all records (handle pagination)
        let allRecords = [];
        let offset = null;

        do {
            let fetchUrl = url;
            if (offset) {
                fetchUrl += `&offset=${offset}`;
            }

            const response = await fetch(fetchUrl, {
                headers: {
                    'Authorization': `Bearer ${env.AIRTABLE_API_KEY}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Airtable API Error:', errorText);
                return new Response(
                    JSON.stringify({
                        error: 'Failed to fetch from Airtable',
                        details: errorText
                    }),
                    {
                        status: response.status,
                        headers: {
                            "Content-Type": "application/json",
                            "Access-Control-Allow-Origin": "*",
                        },
                    }
                );
            }

            const data = await response.json();
            allRecords = allRecords.concat(data.records || []);
            offset = data.offset; // Will be undefined when no more pages

        } while (offset);

        console.log(`✅ Fetched ${allRecords.length} records from Airtable`);

        // Transform records to include all needed fields
        const transformedRecords = allRecords.map(record => ({
            id: record.id,
            prompt: record.fields.Prompt || '',
            user: record.fields.User || '',
            email: record.fields.Email || '',
            imageUpload: record.fields.Image_Upload || [],
            imageUpload2: record.fields.Image_Upload2 || [],
            timestamp: record.fields.Timestamp || '',
            orderPackage: record.fields.Order_Package || '',
        }));

        return new Response(
            JSON.stringify({
                records: transformedRecords,
                count: transformedRecords.length,
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
        console.error('❌ Error fetching Airtable data:', error);
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
