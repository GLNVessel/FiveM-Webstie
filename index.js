const express = require('express');
const session = require('express-session');
const { request } = require('undici');
const mysql = require('mysql2');
const { clientId, clientSecret, port, botToken } = require('./config.json');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

// Set up session middleware
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set secure to true if using HTTPS
}));

const db = mysql.createConnection({
    host: '5.78.106.41',
    user: 'u5986_P2COArz8KK',
    password: 'acy+m^Tll+7Ldgo4=x0Bk2C8',
    database: 's5986_Fivem-Business-Tool-V2',
    port: 3306
});

// Connect to MySQL database
db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err.stack);
        return;
    }
    console.log('Connected to MySQL database as ID', db.threadId);
});

app.get('/', async (req, res) => {
    return res.sendFile('index.html', { root: '.' });
});

app.get('/servers', async (req, res) => {
    const { code } = req.query;

    // If there's a code, exchange it for an access token
    if (code) {
        try {
            const tokenResponseData = await request('https://discord.com/api/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: `https://fivemdiscordbot.netlify.app/servers`,
                    scope: 'identify guilds',
                }).toString(),
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
            });

            const oauthData = await tokenResponseData.body.json();

            if (oauthData.error) {
                return res.send(`OAuth Error: ${oauthData.error_description}`);
            }

            // Store the access token in session
            req.session.accessToken = oauthData.access_token;

            // Fetch the user's profile data
            const userProfileResponse = await request('https://discord.com/api/users/@me', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${req.session.accessToken}`,
                },
            });

            const userProfile = await userProfileResponse.body.json();
            req.session.userProfile = userProfile;

            // Redirect to /servers without the code
            return res.redirect('/servers');
        } catch (error) {
            console.error('Error during token request:', error);
            return res.status(500).send('Internal Server Error');
        }
    }

    // If there's no code, check if we have an access token in the session
    const accessToken = req.session.accessToken;
    if (!accessToken) {
        return res.send('No code provided');
    }

    // Serve the servers.html file
    return res.sendFile(path.join(__dirname, 'public', 'servers.html'));
});


// New route to render the server details page
app.get('/server', async (req, res) => {
    const { guildId } = req.query;
    
    if (!guildId) {
        return res.status(400).send('Guild ID not provided');
    }

    try {
        // Fetch the guild information using the bot token
        const guildResponse = await request(`https://discord.com/api/v10/guilds/${guildId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bot ${botToken}`,
            },
        });

        const guildData = await guildResponse.body.json();

        if (guildData.message === "Unknown Guild") {
            return res.status(404).send('Guild not found');
        }

        // Render the guild page with the guild name and sidebar
        res.send(`
            <html>
            <head>
                <title>${guildData.name}</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        background-color: #202225;
                        color: #fff;
                        margin: 0;
                        padding: 0;
                    }
                    .container {
                        padding: 20px;
                    }
                    .sidebar {
                        height: 100%;
                        width: 250px;
                        position: fixed;
                        top: 0;
                        left: 0;
                        background-color: #2f3136;
                        padding-top: 20px;
                    }
                    .sidebar a {
                        padding: 15px 20px;
                        text-decoration: none;
                        font-size: 18px;
                        color: #fff;
                        display: block;
                    }
                    .sidebar a.active {
                        color: #7289da;
                    }
                    .sidebar a:hover {
                        background-color: #7289da;
                    }
                    .content {
                        margin-left: 260px;
                        padding: 20px;
                    }
                </style>
            </head>
            <body>
                <!-- Sidebar -->
                <div class="sidebar" id="sidebar">
                    <a href="/server?guildId=${guildId}" class="active">Main</a>
                    <a href="/invoices?guildId=${guildId}">User Invoices</a>
                </div>
        
                <div class="content">
                    <h1>Welcome to Fivem Business Management Tool</h1>
                    <p>Guild ID: ${guildId}</p>
                </div>
        
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Error fetching guild data:', error);
        return res.status(500).send('Internal Server Error');
    }
});

// New route for User Invoices
app.get('/invoices', async (req, res) => {
    const { guildId } = req.query;

    if (!guildId) {
        return res.status(400).send('Guild ID not provided');
    }

    try {
        // Fetch invoices related to the guildId from the database
        db.query('SELECT user_id, SUM(price) AS total_price FROM invoices WHERE guild_id = ? GROUP BY user_id', [guildId], async (err, results) => {
            if (err) {
                console.error('Error fetching invoices:', err.stack);
                return res.status(500).send('Error fetching invoices');
            }

            // Fetch usernames and role information for all unique user_ids in the invoices
            const userDetails = [];

            for (const invoice of results) {
                const userId = invoice.user_id;
                let username = 'Unknown User';
                let roles = [];
                
                try {
                    // Fetch user's roles from Discord API
                    const userResponse = await request(`https://discord.com/api/v10/guilds/${guildId}/members/${userId}`, {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bot ${botToken}`,
                        },
                    });
                    
                    const userData = await userResponse.body.json();
                    username = `${userData.user.username}#${userData.user.discriminator}`;
                    roles = userData.roles;

                    // Debugging log to see roles
                    console.log(`Roles for ${username}: ${roles}`);
                } catch (fetchError) {
                    console.error(`Error fetching user with ID ${userId}:`, fetchError);
                }

                // Sort roles by priority (highest first) and iterate to find a percentage
                let percentage = 0;

                for (const roleId of roles) {
                    const [percentageData] = await db.promise().query(
                        'SELECT percentage FROM percentages WHERE guild_id = ? AND role_id = ?',
                        [guildId, roleId]
                    );

                    if (percentageData.length > 0) {
                        percentage = percentageData[0].percentage;
                        console.log(`User: ${username}, Found percentage for Role ID: ${roleId} -> ${percentage}%`);
                        break; // Exit the loop once we find a percentage
                    } else {
                        console.log(`No percentage found for Role ID: ${roleId}`);
                    }
                }

                // Calculate the commission based on the total price and percentage
                const commission = (invoice.total_price * percentage) / 100;

                // Log the user's name and commission percentage to the console
                console.log(`User: ${username}, Final Commission: ${percentage}%, Commission Amount: ${commission}`);

                // Store the user details
                userDetails.push({
                    username,
                    total_price: invoice.total_price,
                    percentage,
                    commission: commission.toFixed(2)  // Format to 2 decimal places
                });
            }

            // Render the results in HTML
            let invoicesHtml = `
                <html>
                <head>
                    <title>User Invoices</title>
                    <style>
                        body {
                            font-family: Arial, sans-serif;
                            background-color: #202225;
                            color: #fff;
                            margin: 0;
                            padding: 0;
                        }
                        .container {
                            padding: 20px;
                        }
                        .sidebar {
                            height: 100%;
                            width: 250px;
                            position: fixed;
                            top: 0;
                            left: 0;
                            background-color: #2f3136;
                            padding-top: 20px;
                        }
                        .sidebar a {
                            padding: 15px 20px;
                            text-decoration: none;
                            font-size: 18px;
                            color: #fff;
                            display: block;
                        }
                        .sidebar a.active {
                            color: #7289da;
                        }
                        .sidebar a:hover {
                            background-color: #7289da;
                        }
                        .content {
                            margin-left: 260px;
                            padding: 20px;
                        }
                        table {
                            width: 100%;
                            border-collapse: collapse;
                        }
                        table, th, td {
                            border: 1px solid #555;
                        }
                        th, td {
                            padding: 10px;
                            text-align: left;
                        }
                        th {
                            background-color: #333;
                        }
                    </style>
                </head>
                <body>
                    <!-- Sidebar -->
                    <div class="sidebar">
                        <a href="/server?guildId=${guildId}">Main</a>
                        <a href="/invoices?guildId=${guildId}" class="active">User Invoices</a>
                    </div>

                    <div class="content">
                        <h1>User Invoices for Guild ID: ${guildId}</h1>
                        <table>
                            <tr>
                                <th>User</th>
                                <th>Total Price</th>
                                <th>Commission Percentage</th>
                                <th>Commission Amount</th>
                            </tr>
            `;

            userDetails.forEach(user => {
                invoicesHtml += `
                    <tr>
                        <td>${user.username}</td>
                        <td>${Number(user.total_price).toFixed(2)}</td>
                        <td>$${user.commission}</td>
                        <td>${user.percentage}%</td>   
                    </tr>
                `;
            });

            invoicesHtml += `
                        </table>
                    </div>
                </body>
                </html>
            `;

            res.send(invoicesHtml);
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        return res.status(500).send('Internal Server Error');
    }
});





// Logout route
app.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error('Error destroying session:', err);
            return res.status(500).send('Error logging out');
        }
        res.redirect('http://localhost:53134');
    });
});

app.listen(port, () => console.log(`App listening at http://localhost:${port}`));
