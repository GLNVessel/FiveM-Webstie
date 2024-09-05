const express = require('express');
const session = require('express-session');
const path = require('path');
const { request } = require('undici');
const mysql = require('mysql2');
const { clientId, clientSecret, port, botToken } = require('./config.json');

const app = express();

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// Set up session middleware
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set secure to true if using HTTPS
}));

// MySQL connection
const db = mysql.createConnection({
    host: '5.78.106.41',
    user: 'u5986_P2COArz8KK',
    password: 'acy+m^Tll+7Ldgo4=x0Bk2C8',
    database: 's5986_Fivem-Business-Tool-V2',
    port: 3306
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err.stack);
        return;
    }
    console.log('Connected to MySQL database as ID', db.threadId);
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fetch user data and guilds for servers.html
app.get('/api/user-data', async (req, res) => {
    const accessToken = req.session.accessToken;

    // Check if access token is available in session
    if (!accessToken) {
        return res.status(401).json({ error: 'No access token found' });
    }

    try {
        // Fetch user's profile data
        const userProfileResponse = await request('https://discord.com/api/users/@me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        const userProfile = await userProfileResponse.body.json();
        
        // Fetch user's guilds using the access token
        const guildsResponse = await request('https://discord.com/api/users/@me/guilds', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        });
        const userGuilds = await guildsResponse.body.json();

        // Fetch the bot's guilds using the bot token
        const botGuildsResponse = await request('https://discord.com/api/v10/users/@me/guilds', {
            method: 'GET',
            headers: {
                'Authorization': `Bot ${botToken}`,
            },
        });
        const botGuilds = await botGuildsResponse.body.json();

        // Convert botGuilds to a Set for fast lookup
        const botGuildIds = new Set(botGuilds.map(guild => guild.id));

        // Separate manageable guilds
        const botInGuilds = [];
        const botNotInGuilds = [];

        userGuilds.forEach(guild => {
            if ((guild.permissions & 0x20) === 0x20) { // MANAGE_GUILD permission
                if (botGuildIds.has(guild.id)) {
                    botInGuilds.push(guild);
                } else {
                    botNotInGuilds.push(guild);
                }
            }
        });

        // Send user profile, guilds, and bot invite link to the client
        res.json({
            userProfile,
            guilds: [...botInGuilds, ...botNotInGuilds],
            inviteUrl: `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot&response_type=code&redirect_uri=http://localhost:${port}/servers`
        });

    } catch (error) {
        console.error('Error fetching data:', error);
        return res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// Serve the servers.html file
app.get('/servers', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'servers.html'));
});

// Serve the server details page
app.get('/server', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'server.html'));
});

// Serve the invoices page
app.get('/invoices', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'invoices.html'));
});

// Start the server
app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});
