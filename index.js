const fs = require('fs');
const express = require('express')
const app = express()
const port = 80
const { Client } = require('ldapts');
const axios = require('axios').default;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const backupsDir = './backups/';
if (!fs.existsSync(backupsDir)){
    fs.mkdirSync(backupsDir);
}

const url = 'ldap://ldap.bath.ac.uk:389';
const baseDN = 'ou=people,o=bath.ac.uk';

const client = new Client({
  url
});

async function getStudentIDFromLdap(username){
    const searchresults = await client.search(baseDN, {
        filter: `(uid=${username})`,
    });
    return searchresults.searchEntries[0].studentId;
}

async function backupExamsPage(username){
    const studentId = await getStudentIDFromLdap(username);
    let options = {
        method: 'GET',
        url: `https://samis.bath.ac.uk/examschedule/${studentId}`,
        headers: {
            'Referer': 'https://samis.bath.ac.uk/'
        }
    };
    const response = await axios.get(options.url, { headers: options.headers });
    if(response.data.includes('Exam Code')){
        fs.writeFileSync(`${backupsDir}${username}_exams.html`, response.data);
    }
    else console.log(`No exam data found for ${username}, its probably down again.`);
}

async function backupJob(){
    const searchresults = await client.search('ou=groups,o=bath.ac.uk', {
        filter: `(cn=susrv01-polling)`,
    });
    for (const entry of searchresults.searchEntries[0].member) {
        let username = entry.split(',')[0].split('=')[1];
        try {
            await backupExamsPage(username);
            console.log(`Backed up exams page for ${username}`);
        } catch (err) {
            console.log(`Error backing up exams page for ${username}: ${err}`);
        }
        await wait(300000); // wait 5 minutes between requests
    }
    backupJob(); // repeat indefinitely
}

app.get('/exams/:id', (req, res) => {
    getStudentIDFromLdap(req.params.id).then((studentId) => {
        let options = {
            method: 'GET',
            url: `https://samis.bath.ac.uk/examschedule/${studentId}`,
            headers: {
                'Referer': 'https://samis.bath.ac.uk/'
            }
        };
        axios.get(options.url, { headers: options.headers })
        .then(function (response) {
            // handle success
            if(!response.data.includes('Exam Code')){
                // send backup instead
                if (fs.existsSync(`${backupsDir}${req.params.id}_exams.html`)){
                    const backupData = fs.readFileSync(`${backupsDir}${req.params.id}_exams.html`, 'utf8');
                    res.send('<h1>This is a backup</h1>'+backupData);
                }
                else {
                    res.status(404).send('Exams page not found, and no backup available.');
                }
            }
            else {
                res.send(response.data);
            }
                
        })
        .catch(function (error) {
            if (fs.existsSync(`${backupsDir}${req.params.id}_exams.html`)){
                const backupData = fs.readFileSync(`${backupsDir}${req.params.id}_exams.html`, 'utf8');
                res.send('<h1>This is a backup</h1>'+backupData);
            } else {
                res.status(404).send('Exams page not found, and no backup available.');
            }
        });
    }).catch((err) => {
        res.status(404).send('Error retrieving student ID');
    });
})

app.listen(port, () => {
    console.log(`Exam app listening on port ${port}`)
})

backupJob(); // run at startup