const TEAMS = [
  { key: 'U8 Boys Gunners',   color: '#E24B4A' },
  { key: 'U8 Girls Cherries', color: '#D85A30' },
  { key: 'U10 Boys Gunners',  color: '#BA7517' },
  { key: 'U10 Boys Lions',    color: '#639922' },
  { key: 'U10 Girls',         color: '#1D9E75' },
  { key: 'U12 Boys Gunners',  color: '#185FA5' },
  { key: 'U12 Boys Reds',     color: '#534AB7' },
  { key: 'U12 Girls',         color: '#993556' },
  { key: 'U14 Boys',          color: '#5F5E5A' },
  { key: 'U14 Girls',         color: '#8E24AA' },
  { key: 'U16 Girls',         color: '#0F6E56' },
  { key: 'U16G',              color: '#0F6E56' },
  { key: 'U17 Boys',          color: '#D85A30' },
];
const COLOR = {};
TEAMS.forEach(t => { COLOR[t.key] = t.color; });

// Returns the TEAMS key if the given name matches one of our teams, otherwise null.
function matchOurTeam(name) {
    const lower = name.toLowerCase();
    const match = TEAMS.find(t => lower.includes(t.key.toLowerCase()));
    return match ? match.key : null;
}

// Parses a single CSV row, respecting quoted fields.
function parseCSVRow(line) {
    const cells = [];
    let inQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    cells.push(current.trim());
    return cells;
}

// Parses a GotSport CSV export into our RAW data format.
function parseCSV(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) throw new Error('File appears empty.');

    const headers = parseCSVRow(lines[0]).map(h => h.toLowerCase());

    // Flexibly find a column index by checking if the header contains any of the given strings.
    const col = (...names) => headers.findIndex(h => names.some(n => h.includes(n)));

    const matchCol    = col('match', 'game #', 'game#', 'id');
    const dateCol     = col('date');
    const timeCol     = col('time');
    const homeCol     = col('home team', 'home');
    const awayCol     = col('away team', 'away');
    const locationCol = col('location', 'field', 'venue', 'site');
    const ageCol      = col('age');
    const genderCol   = col('gender');

    if (dateCol < 0)  throw new Error('Could not find a "Date" column. Please check your CSV headers.');
    if (homeCol < 0 || awayCol < 0) throw new Error('Could not find "Home Team" and "Away Team" columns. Please check your CSV headers.');

    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const cells = parseCSVRow(lines[i]);
        const get = idx => (idx >= 0 && idx < cells.length) ? cells[idx] : '';

        const homeTeam = get(homeCol);
        const awayTeam = get(awayCol);

        // Determine which side is ours based on TEAMS matching.
        const homeKey = matchOurTeam(homeTeam);
        const awayKey = matchOurTeam(awayTeam);

        let ourTeam, opponent, ha;
        if (homeKey && !awayKey) {
            ourTeam = homeKey; opponent = awayTeam; ha = 'Home';
        } else if (awayKey && !homeKey) {
            ourTeam = awayKey; opponent = homeTeam; ha = 'Away';
        } else if (homeKey && awayKey) {
            // Both sides are ours (e.g. scrimmage) — treat home as primary.
            ourTeam = homeKey; opponent = awayTeam; ha = 'Home';
        } else {
            // Neither matched — skip this row.
            continue;
        }

        // Parse age: prefer dedicated column, fall back to extracting from team name.
        let age = ageCol >= 0 ? parseInt(get(ageCol)) : 0;
        if (!age) {
            const m = ourTeam.match(/U(\d+)/i);
            age = m ? parseInt(m[1]) : 0;
        }

        // Parse gender: prefer dedicated column, fall back to team name keywords.
        let gender = genderCol >= 0 ? get(genderCol) : '';
        if (!gender) {
            const lower = ourTeam.toLowerCase();
            if (lower.includes('girl') || lower.includes('female')) gender = 'Female';
            else if (lower.includes('boy') || lower.includes('male')) gender = 'Male';
            else gender = 'Coed';
        }

        rows.push({
            match:    matchCol >= 0 ? (parseInt(get(matchCol)) || i) : i,
            date:     get(dateCol),
            time:     get(timeCol),
            ourTeam,
            opponent,
            ha,
            location: get(locationCol),
            age,
            gender,
        });
    }

    if (rows.length === 0) throw new Error('No matching MSUSC games found. Make sure your team names match the legend.');
    return rows;
}

function updateSubtitle() {
    if (!RAW.length) return;
    const dates = RAW.map(e => parseDate(e.date));
    const min = new Date(Math.min(...dates));
    const max = new Date(Math.max(...dates));
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const teams = new Set(RAW.map(e => e.ourTeam)).size;
    document.getElementById('subtitle').textContent =
        `Mechanicville-Stillwater — ${RAW.length} matches across ${teams} teams · ${MONTHS[min.getMonth()]} ${min.getDate()} – ${MONTHS[max.getMonth()]} ${max.getDate()}`;
}

function handleCSVUpload(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const parsed = parseCSV(e.target.result);
            RAW.length = 0;
            RAW.push(...parsed);
            activeTeams.clear();
            buildLegend();
            updateStats();
            updateSubtitle();
            render();
        } catch (err) {
            alert('Import failed: ' + err.message);
        }
        // Reset so the same file can be re-uploaded if needed.
        input.value = '';
    };
    reader.readAsText(file);
}

const RAW = [{"match":6,"date":"04/10/2026","time":"19:00","ourTeam":"U16G","opponent":"SWSC U15 Girls","ha":"Home","location":"Afrim's Sports Park - Afrim's Sports Park Field 4B - OUT","age":16,"gender":"Female"},{"match":108,"date":"04/11/2026","time":"14:30","ourTeam":"U16G","opponent":"Capital City FC U16 Girls Integrity","ha":"Home","location":"Afrim's Sports Park - Afrim's Sports Park Field 2 - OUT","age":16,"gender":"Female"},{"match":109,"date":"04/11/2026","time":"18:30","ourTeam":"U16G","opponent":"NY Rush Select 11G DPL","ha":"Away","location":"Afrim's Sports Park - Afrim's Sports Park Field 2 - OUT","age":16,"gender":"Female"},{"match":126,"date":"04/12/2026","time":"11:00","ourTeam":"U16G","opponent":"Alleycats NPL G11","ha":"Home","location":"Afrim's Sports Park - Afrim's Sports Park Field 3 - OUT","age":16,"gender":"Female"},{"match":1022,"date":"04/18/2026","time":"11:00","ourTeam":"U16 Girls","opponent":"SWSC U16 Girls","ha":"Away","location":"Gavin Park - Field 9","age":16,"gender":"Female"},{"match":803,"date":"04/18/2026","time":"17:45","ourTeam":"U14 Boys","opponent":"FC Dutchmen Surf STRIKERS 2012 boys NPL","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Male"},{"match":1013,"date":"04/19/2026","time":"14:45","ourTeam":"U16 Girls","opponent":"Capital City FC U16 Girls Integrity - CDYSL","ha":"Away","location":"Lansingburgh High School - Soccer Field","age":16,"gender":"Female"},{"match":104,"date":"04/20/2026","time":"18:30","ourTeam":"U8 Girls Cherries","opponent":"Fifty FC U8 Coed 25-26 Black","ha":"Home","location":"MSYSL Fields - Field 1","age":8,"gender":"Coed"},{"match":614,"date":"04/21/2026","time":"18:30","ourTeam":"U12 Boys Reds","opponent":"U12B Wolves","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Male"},{"match":1186,"date":"04/21/2026","time":"18:30","ourTeam":"U10 Boys Gunners","opponent":"Fifty FC U10 Boys 25-26 Black","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Male"},{"match":102,"date":"04/25/2026","time":"10:00","ourTeam":"U8 Boys Gunners","opponent":"SWSC U8 Boys White","ha":"Home","location":"MSYSL Fields - Field 1","age":8,"gender":"Coed"},{"match":1020,"date":"04/26/2026","time":"14:45","ourTeam":"U16 Girls","opponent":"Brunswick U16 Girls CDYSL 2026","ha":"Home","location":"MSYSL Fields - Field 4","age":16,"gender":"Female"},{"match":804,"date":"04/26/2026","time":"17:45","ourTeam":"U14 Boys","opponent":"Niskayuna U14 Boys 2025-26","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Male"},{"match":111,"date":"04/27/2026","time":"18:30","ourTeam":"U8 Girls Cherries","opponent":"FC Dutchmen Suf WAVE 2018 girls","ha":"Away","location":"Dicaprio Park - Field 2","age":8,"gender":"Coed"},{"match":328,"date":"04/28/2026","time":"18:30","ourTeam":"U10 Boys Lions","opponent":"Niskayuna U9 Boys White 2025-26","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Male"},{"match":1195,"date":"04/28/2026","time":"18:30","ourTeam":"U10 Boys Gunners","opponent":"Eagles - Albany Soccer Club","ha":"Away","location":"hoffman park FBI Field (U8, U10, U12) - hoffman park FBI Field (U8, U10, U12)","age":10,"gender":"Male"},{"match":544,"date":"04/28/2026","time":"18:30","ourTeam":"U12 Boys Gunners","opponent":"SWSC U12 Boys White","ha":"Away","location":"Gavin Park - 6A","age":12,"gender":"Male"},{"match":728,"date":"04/29/2026","time":"18:30","ourTeam":"U12 Girls","opponent":"Greenville U12 Girls Galaxy","ha":"Away","location":"Greenville Town Park (George V Vanderbilt Park) - Field 2","age":12,"gender":"Female"},{"match":622,"date":"04/30/2026","time":"18:30","ourTeam":"U12 Boys Reds","opponent":"Colonie U12 Boys Garnet","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Male"},{"match":893,"date":"04/30/2026","time":"18:30","ourTeam":"U14 Girls","opponent":"FC Dutchmen Surf FURY 2012g DPL","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Female"},{"match":108,"date":"04/30/2026","time":"18:30","ourTeam":"U8 Boys Gunners","opponent":"CPSC Evolution U8 Boys Black 25/26","ha":"Away","location":"Clifton Common  - U8 A","age":8,"gender":"Coed"},{"match":535,"date":"05/01/2026","time":"18:30","ourTeam":"U12 Boys Gunners","opponent":"RUSC U12 Boys","ha":"Away","location":"Rotterdam United Soccer Fields - U12 Field 1","age":12,"gender":"Male"},{"match":811,"date":"05/01/2026","time":"18:30","ourTeam":"U14 Boys","opponent":"FC Dutchmen Surf RIPTIDE 2013 boys NPL","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Male"},{"match":150,"date":"05/02/2026","time":"10:00","ourTeam":"U8 Boys Gunners","opponent":"CPSC Evolution U8 Boys Black 25/26","ha":"Away","location":"Clifton Common  - U8 A","age":8,"gender":"Coed"},{"match":1290,"date":"05/03/2026","time":"13:00","ourTeam":"U17 Boys","opponent":"Force B U18B","ha":"Home","location":"MSYSL Fields - Field 4","age":19,"gender":"Male"},{"match":1259,"date":"05/03/2026","time":"16:15","ourTeam":"U10 Boys Gunners","opponent":"FC Dutchmen Surf RISING 2016 boys","ha":"Away","location":"Dicaprio Park - Field 10","age":10,"gender":"Male"},{"match":339,"date":"05/03/2026","time":"17:45","ourTeam":"U10 Boys Lions","opponent":"FC Columbia (2026) U10 Boys Blue Div 4","ha":"Away","location":"St Joseph Spiritual Center Mavis Fields - U10 Left Game Field","age":10,"gender":"Male"},{"match":808,"date":"05/03/2026","time":"17:45","ourTeam":"U14 Boys","opponent":"Colonie U14 Boys Garnet","ha":"Away","location":"lisha kill sports complex Colonie Soccer Club - 10","age":14,"gender":"Male"},{"match":115,"date":"05/04/2026","time":"18:30","ourTeam":"U8 Boys Gunners","opponent":"Ballston Spa Soccer Club U8 Co-ED C Pumas","ha":"Home","location":"MSYSL Fields - Field 1","age":8,"gender":"Coed"},{"match":1205,"date":"05/05/2026","time":"18:30","ourTeam":"U10 Boys Gunners","opponent":"FC Dutchmen Surf RISING 2016 boys","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Male"},{"match":553,"date":"05/05/2026","time":"18:30","ourTeam":"U12 Boys Gunners","opponent":"Ballston Spa Soccer Club U12 Boys C","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Male"},{"match":633,"date":"05/05/2026","time":"18:30","ourTeam":"U12 Boys Reds","opponent":"CPSC U12 Boys Yellow Jackets 25/26","ha":"Away","location":"Clifton Common  - 5B","age":12,"gender":"Male"},{"match":447,"date":"05/07/2026","time":"18:30","ourTeam":"U10 Girls","opponent":"FC Columbia (2026) U10 Girls Div 4","ha":"Away","location":"St Joseph Spiritual Center Mavis Fields - U10 Left Game Field","age":10,"gender":"Female"},{"match":1025,"date":"05/10/2026","time":"14:45","ourTeam":"U16 Girls","opponent":"Berkshire Ajax U16 Girls","ha":"Away","location":"Williams College - Farley Lamb Field","age":16,"gender":"Female"},{"match":733,"date":"05/10/2026","time":"17:45","ourTeam":"U12 Girls","opponent":"RVW U12 Girls Spring Travel 2026","ha":"Away","location":"Rip Van Winkle Soccer Field - Field 3","age":12,"gender":"Female"},{"match":439,"date":"05/11/2026","time":"18:30","ourTeam":"U10 Girls","opponent":"CPSC U10 Girls Shooting Stars 25/26","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Female"},{"match":1295,"date":"05/11/2026","time":"18:30","ourTeam":"U17 Boys","opponent":"Otsego United U17 Boys Spring '26","ha":"Away","location":"Ryder Elementary School - Ryder Elementary School Field 1","age":19,"gender":"Male"},{"match":122,"date":"05/11/2026","time":"18:30","ourTeam":"U8 Girls Cherries","opponent":"SWSC U8 Girls White","ha":"Away","location":"Gavin Park - 3D","age":8,"gender":"Coed"},{"match":121,"date":"05/11/2026","time":"18:30","ourTeam":"U8 Boys Gunners","opponent":"Averill Park Football Club U8 Coed","ha":"Away","location":"Algonquin Middle School - U8 Fields","age":8,"gender":"Coed"},{"match":643,"date":"05/12/2026","time":"18:30","ourTeam":"U12 Boys Reds","opponent":"Averill Park Football Club U12 Boys Endurance","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Male"},{"match":352,"date":"05/12/2026","time":"18:30","ourTeam":"U10 Boys Lions","opponent":"Greenbush SC Boys 2016 (U10)-Black","ha":"Away","location":"Greenbush Soccer Complex - \tGYSC Field 2A","age":10,"gender":"Male"},{"match":1212,"date":"05/12/2026","time":"18:30","ourTeam":"U10 Boys Gunners","opponent":"Colonie U10 Boys Garnet","ha":"Away","location":"lisha kill sports complex Colonie Soccer Club - 7","age":10,"gender":"Male"},{"match":452,"date":"05/14/2026","time":"18:30","ourTeam":"U10 Girls","opponent":"Ballston Spa Soccer Club U10 Girls C Blaze","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Female"},{"match":735,"date":"05/15/2026","time":"18:30","ourTeam":"U12 Girls","opponent":"2014/15 RCS Girls","ha":"Away","location":"Coeyman's Landing - Coeyman's Landing Field 2","age":12,"gender":"Female"},{"match":1284,"date":"05/16/2026","time":"13:00","ourTeam":"U17 Boys","opponent":"Force M U18B","ha":"Home","location":"MSYSL Fields - Field 4","age":19,"gender":"Male"},{"match":901,"date":"05/16/2026","time":"14:45","ourTeam":"U14 Girls","opponent":"Fifty FC U14 Girls 25-26","ha":"Away","location":"Maalwyk Park - Field 2 - Full Field","age":14,"gender":"Female"},{"match":1299,"date":"05/17/2026","time":"13:00","ourTeam":"U17 Boys","opponent":"Galway Soccer Club 18u Boys","ha":"Home","location":"MSYSL Fields - Field 4","age":19,"gender":"Male"},{"match":1029,"date":"05/17/2026","time":"14:45","ourTeam":"U16 Girls","opponent":"Catskill U16 Girls Soccer","ha":"Home","location":"MSYSL Fields - Field 4","age":16,"gender":"Female"},{"match":905,"date":"05/17/2026","time":"16:15","ourTeam":"U14 Girls","opponent":"Capital City U14 Girls Courage","ha":"Away","location":"Lansingburgh HS  - Field 1 - turf","age":14,"gender":"Female"},{"match":813,"date":"05/17/2026","time":"17:45","ourTeam":"U14 Boys","opponent":"Union","ha":"Away","location":"North Colonie Soccer Complex - Field 2","age":14,"gender":"Male"},{"match":652,"date":"05/17/2026","time":"17:45","ourTeam":"U12 Boys Reds","opponent":"FC Dutchmen Surf ROWDIES 2015 boys","ha":"Away","location":"Dicaprio Park - Field 8","age":12,"gender":"Male"},{"match":363,"date":"05/19/2026","time":"18:30","ourTeam":"U10 Boys Lions","opponent":"SWSC U9/10 Boys White","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Male"},{"match":130,"date":"05/19/2026","time":"18:30","ourTeam":"U8 Girls Cherries","opponent":"CPSC Evolution U8 Grey 25/26","ha":"Away","location":"Clifton Common  - U8 B","age":8,"gender":"Coed"},{"match":571,"date":"05/19/2026","time":"18:30","ourTeam":"U12 Boys Gunners","opponent":"Averill Park Football Club U12 Boys Mighty","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Male"},{"match":897,"date":"05/20/2026","time":"18:30","ourTeam":"U14 Girls","opponent":"970 United Girls U14B Yellow","ha":"Away","location":"Shenendehowa High School - Turf Field 13","age":14,"gender":"Female"},{"match":752,"date":"05/20/2026","time":"18:30","ourTeam":"U12 Girls","opponent":"FC Dutchmen Surf BLUE SKY 2014 girls","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Female"},{"match":458,"date":"05/21/2026","time":"18:30","ourTeam":"U10 Girls","opponent":"Fifty FC U10 Girls 25-26","ha":"Away","location":"Maalwyk Park - Field 7","age":10,"gender":"Female"},{"match":1301,"date":"05/22/2026","time":"18:30","ourTeam":"U17 Boys","opponent":"U19B White Lightning","ha":"Away","location":"Ridge/Jenkinsville - Field 2","age":19,"gender":"Male"},{"match":562,"date":"05/23/2026","time":"13:00","ourTeam":"U12 Boys Gunners","opponent":"FC Columbia (2026) U12 Boys Red Div 3","ha":"Away","location":"St Joseph Spiritual Center Mavis Fields - U12 Game Field","age":12,"gender":"Male"},{"match":580,"date":"05/26/2026","time":"18:30","ourTeam":"U12 Boys Gunners","opponent":"SWSC U12 Boys White","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Male"},{"match":662,"date":"05/26/2026","time":"18:30","ourTeam":"U12 Boys Reds","opponent":"Colonie U12 Boys Garnet","ha":"Away","location":"lisha kill sports complex Colonie Soccer Club - 9","age":12,"gender":"Male"},{"match":1230,"date":"05/26/2026","time":"18:30","ourTeam":"U10 Boys Gunners","opponent":"New York Elite Alleycats FC 2017 Gray","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Male"},{"match":908,"date":"05/27/2026","time":"18:30","ourTeam":"U14 Girls","opponent":"Albany Rush 2012/13 Girls","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Female"},{"match":760,"date":"05/27/2026","time":"18:30","ourTeam":"U12 Girls","opponent":"RVW U12 Girls Spring Travel 2026","ha":"Away","location":"Rip Van Winkle Soccer Field - Field 3","age":12,"gender":"Female"},{"match":1034,"date":"05/27/2026","time":"18:30","ourTeam":"U16 Girls","opponent":"Niskayuna U16 Girls 2025-26","ha":"Away","location":"Niskayuna Soccer Complex at Zenner Rd - Field 2","age":16,"gender":"Female"},{"match":818,"date":"05/28/2026","time":"18:30","ourTeam":"U14 Boys","opponent":"FC Dutchmen Surf STRIKERS 2012 boys NPL","ha":"Away","location":"Dicaprio Park - Field 3","age":14,"gender":"Male"},{"match":465,"date":"05/28/2026","time":"18:30","ourTeam":"U10 Girls","opponent":"2017/18 RCS Girls","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Female"},{"match":767,"date":"05/29/2026","time":"18:30","ourTeam":"U12 Girls","opponent":"Blue Jays - Albany Soccer Club","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Female"},{"match":133,"date":"05/30/2026","time":"10:00","ourTeam":"U8 Boys Gunners","opponent":"FC Dutchmen Surf SHARKS 2018 boys","ha":"Away","location":"Dicaprio Park - Field 2","age":8,"gender":"Coed"},{"match":135,"date":"05/30/2026","time":"10:00","ourTeam":"U8 Girls Cherries","opponent":"FC Dutchmen Suf WAVE 2018 girls","ha":"Home","location":"MSYSL Fields - Field 1","age":8,"gender":"Coed"},{"match":1308,"date":"05/31/2026","time":"13:00","ourTeam":"U17 Boys","opponent":"Capital City U17 Boys Integrity","ha":"Home","location":"MSYSL Fields - Field 4","age":19,"gender":"Male"},{"match":1038,"date":"05/31/2026","time":"14:45","ourTeam":"U16 Girls","opponent":"RVW U16 Girls Spring 2026","ha":"Home","location":"MSYSL Fields - Field 4","age":16,"gender":"Female"},{"match":889,"date":"05/31/2026","time":"16:15","ourTeam":"U14 Girls","opponent":"FC Dutchmen Surf STORM 2013g DPL","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Female"},{"match":820,"date":"05/31/2026","time":"17:45","ourTeam":"U14 Boys","opponent":"Colonie U14 Boys Garnet","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Male"},{"match":405,"date":"05/31/2026","time":"17:45","ourTeam":"U10 Boys Lions","opponent":"Greenbush SC Boys 2016 (U10)-Black","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Male"},{"match":141,"date":"06/01/2026","time":"18:30","ourTeam":"U8 Girls Cherries","opponent":"New Scotland SC U8 coed","ha":"Away","location":"Stephen P Wallace Park - 1","age":8,"gender":"Coed"},{"match":388,"date":"06/02/2026","time":"18:30","ourTeam":"U10 Boys Lions","opponent":"Niskayuna U9 Boys White 2025-26","ha":"Away","location":"Niskayuna Soccer Complex at Zenner Rd - Field 5B","age":10,"gender":"Male"},{"match":1241,"date":"06/02/2026","time":"18:30","ourTeam":"U10 Boys Gunners","opponent":"RVW U10 Boys I Spring 2026","ha":"Away","location":"Rip Van Winkle Soccer Field - Field 2","age":10,"gender":"Male"},{"match":911,"date":"06/03/2026","time":"18:30","ourTeam":"U14 Girls","opponent":"Fifty FC U14 Girls 25-26","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Female"},{"match":673,"date":"06/04/2026","time":"18:30","ourTeam":"U12 Boys Reds","opponent":"CPSC U12 Boys Yellow Jackets 25/26","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Male"},{"match":469,"date":"06/04/2026","time":"18:30","ourTeam":"U10 Girls","opponent":"SWSC U9 Girls","ha":"Away","location":"Gavin Park - 3A","age":10,"gender":"Female"},{"match":589,"date":"06/05/2026","time":"18:30","ourTeam":"U12 Boys Gunners","opponent":"Ballston Spa Soccer Club U12 Boys C","ha":"Away","location":"Luther Forest Athletic Fields  - U12 FIELD 2","age":12,"gender":"Male"},{"match":399,"date":"06/05/2026","time":"18:30","ourTeam":"U10 Boys Lions","opponent":"FC Columbia (2026) U10 Boys Blue Div 4","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Male"},{"match":117,"date":"06/06/2026","time":"10:00","ourTeam":"U8 Girls Cherries","opponent":"New Scotland SC U8 coed","ha":"Home","location":"MSYSL Fields - Field 1","age":8,"gender":"Coed"},{"match":720,"date":"06/06/2026","time":"14:45","ourTeam":"U12 Girls","opponent":"FC Columbia (2026) U12 Girls Div 4","ha":"Away","location":"St Joseph Spiritual Center Mavis Fields - U12 Game Field","age":12,"gender":"Female"},{"match":1312,"date":"06/07/2026","time":"13:00","ourTeam":"U17 Boys","opponent":"Force M U18B","ha":"Away","location":"Mayfield High School - Mayfield HS","age":19,"gender":"Male"},{"match":914,"date":"06/07/2026","time":"16:15","ourTeam":"U14 Girls","opponent":"970 United Girls U14B Yellow","ha":"Home","location":"MSYSL Fields - Field 4","age":14,"gender":"Female"},{"match":823,"date":"06/07/2026","time":"17:45","ourTeam":"U14 Boys","opponent":"FC Dutchmen Surf RIPTIDE 2013 boys NPL","ha":"Away","location":"Dicaprio Park - Field 3","age":14,"gender":"Male"},{"match":683,"date":"06/07/2026","time":"17:45","ourTeam":"U12 Boys Reds","opponent":"Averill Park Football Club U12 Boys Endurance","ha":"Away","location":"Algonquin Middle School - U12 Field","age":12,"gender":"Male"},{"match":144,"date":"06/08/2026","time":"18:30","ourTeam":"U8 Boys Gunners","opponent":"SWSC U8 Boys White","ha":"Home","location":"MSYSL Fields - Field 1","age":8,"gender":"Coed"},{"match":1249,"date":"06/09/2026","time":"18:30","ourTeam":"U10 Boys Gunners","opponent":"Eagles - Albany Soccer Club","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Male"},{"match":1286,"date":"06/10/2026","time":"18:30","ourTeam":"U17 Boys","opponent":"Force N U18B","ha":"Away","location":"Prospect Hill Cemetery - Prospect Hill Cemetery Field","age":19,"gender":"Male"},{"match":139,"date":"06/11/2026","time":"18:30","ourTeam":"U8 Boys Gunners","opponent":"Colonie U8 Boys Garnet","ha":"Home","location":"MSYSL Fields - Field 1","age":8,"gender":"Coed"},{"match":1041,"date":"06/11/2026","time":"18:30","ourTeam":"U16 Girls","opponent":"Capital City FC U16 Girls Integrity - CDYSL","ha":"Home","location":"MSYSL Fields - Field 4","age":16,"gender":"Female"},{"match":146,"date":"06/13/2026","time":"10:00","ourTeam":"U8 Girls Cherries","opponent":"SWSC U8 Girls White","ha":"Home","location":"MSYSL Fields - Field 1","age":8,"gender":"Coed"},{"match":598,"date":"06/13/2026","time":"13:00","ourTeam":"U12 Boys Gunners","opponent":"FC Columbia (2026) U12 Boys Red Div 3","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Male"},{"match":475,"date":"06/13/2026","time":"16:15","ourTeam":"U10 Girls","opponent":"CPSC U10 Girls Shooting Stars 25/26","ha":"Away","location":"Clifton Common  - 7B","age":10,"gender":"Female"},{"match":407,"date":"06/16/2026","time":"18:30","ourTeam":"U10 Boys Lions","opponent":"SWSC U9/10 Boys White","ha":"Away","location":"Gavin Park - 3A","age":10,"gender":"Male"},{"match":719,"date":"06/17/2026","time":"18:30","ourTeam":"U12 Girls","opponent":"FC Columbia (2026) U12 Girls Div 4","ha":"Home","location":"MSYSL Fields - Field 3","age":12,"gender":"Female"},{"match":483,"date":"06/18/2026","time":"18:30","ourTeam":"U10 Girls","opponent":"FC Columbia (2026) U10 Girls Div 4","ha":"Home","location":"MSYSL Fields - Field 2","age":10,"gender":"Female"}];

let activeTeams = new Set();
let activeHA = null; // null = all, 'Home', or 'Away'
let currentView = 'cal';

function parseDate(d) {
  const [m,day,y] = d.split('/');
  return new Date(+y, +m-1, +day);
}
function fmt12(t) {
  const [h,m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h > 12 ? h-12 : (h===0?12:h)}:${String(m).padStart(2,'0')} ${ampm}`;
}
function filtered() {
  let data = RAW;
  if (activeTeams.size > 0) data = data.filter(e => activeTeams.has(e.ourTeam));
  if (activeHA) data = data.filter(e => e.ha === activeHA);
  return data;
}
function updateStats() {
  const f = filtered();
  document.getElementById('s-games').textContent = f.length;
  document.getElementById('s-home').textContent = f.filter(e=>e.ha==='Home').length;
  document.getElementById('s-away').textContent = f.filter(e=>e.ha==='Away').length;
  document.getElementById('stat-home-card').classList.toggle('active', activeHA === 'Home');
  document.getElementById('stat-away-card').classList.toggle('active', activeHA === 'Away');
}
function toggleHA(ha) {
  activeHA = activeHA === ha ? null : ha;
  updateStats(); render();
}
function buildLegend() {
  const teams = [...new Set(RAW.map(e=>e.ourTeam))].sort();
  const leg = document.getElementById('legend');
  leg.innerHTML = '';
  teams.forEach(t => {
    const c = COLOR[t] || '#888';
    const li = document.createElement('div');
    li.className = 'leg-item';
    li.innerHTML = `<div class="leg-dot" style="background:${c}"></div>${t}`;
    li.onclick = () => toggleTeam(t);
    li.dataset.team = t;
    leg.appendChild(li);
  });
}
function toggleTeam(t) {
  if (activeTeams.has(t)) { activeTeams.delete(t); } else { activeTeams.add(t); }
  document.querySelectorAll('.leg-item').forEach(el => {
    el.style.opacity = (activeTeams.size === 0 || activeTeams.has(el.dataset.team)) ? '1' : '0.35';
  });
  updateStats(); render();
}
function clearFilters() {
  activeTeams.clear();
  activeHA = null;
  document.querySelectorAll('.leg-item').forEach(el => el.style.opacity = '1');
  updateStats(); render();
}
function setView(v) {
  currentView = v;
  document.getElementById('cal-view').style.display = v==='cal' ? '' : 'none';
  document.getElementById('list-view').style.display = v==='list' ? '' : 'none';
  document.getElementById('cal-btn').classList.toggle('active', v==='cal');
  document.getElementById('list-btn').classList.toggle('active', v==='list');
  render();
}
function render() {
  if (currentView === 'cal') renderCal(); else renderList();
}
function renderCal() {
  const f = filtered();
  const byDate = {};
  f.forEach(e => { (byDate[e.date] = byDate[e.date]||[]).push(e); });
  const allDates = f.map(e => parseDate(e.date));
  if (!allDates.length) { document.getElementById('cal-view').innerHTML = '<p style="color:#b4b2a9;padding:1rem">No games match the current filter.</p>'; return; }
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));
  let d = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const end = new Date(maxDate.getFullYear(), maxDate.getMonth()+1, 0);
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  let html = '';
  while (d <= end) {
    const yr = d.getFullYear(), mo = d.getMonth();
    html += `<div class="month-label">${MONTHS[mo]} ${yr}</div>`;
    html += `<div class="week-grid"><div></div>${DAYS.map(day=>`<div class="day-head">${day}</div>`).join('')}</div>`;
    let cur = new Date(yr, mo, 1);
    const startDow = cur.getDay();
    let weekHtml = `<div class="week-grid"><div></div>`;
    for (let i = 0; i < startDow; i++) weekHtml += `<div class="day-cell faded"></div>`;
    while (cur.getMonth() === mo) {
      const mm = String(cur.getMonth()+1).padStart(2,'0');
      const dd = String(cur.getDate()).padStart(2,'0');
      const key = `${mm}/${dd}/${cur.getFullYear()}`;
      const events = byDate[key] || [];
      weekHtml += `<div class="day-cell"><div class="day-num">${cur.getDate()}</div>`;
      events.forEach((ev, idx) => {
        const c = COLOR[ev.ourTeam] || '#888';
        const extra = idx >= 3 ? 'overflow-chip" style="display:none;' : '" style="';
        weekHtml += `<div class="event-chip ${extra}background:${c}22;color:${c};border:0.5px solid ${c}55" onclick="showModal(${ev.match})">${ev.ourTeam}</div>`;
      });
      if (events.length > 3) weekHtml += `<div class="more-chip" onclick="var p=this.parentElement;p.querySelectorAll('.overflow-chip').forEach(function(el){el.style.display=''});this.remove()">+${events.length-3} more</div>`;
      weekHtml += `</div>`;
      cur.setDate(cur.getDate()+1);
      if (cur.getDay() === 0 && cur.getMonth() === mo) weekHtml += `</div><div class="week-grid"><div></div>`;
    }
    const endDow = new Date(yr,mo+1,0).getDay();
    if (endDow < 6) for (let i = endDow+1; i <= 6; i++) weekHtml += `<div class="day-cell faded"></div>`;
    weekHtml += `</div>`;
    html += weekHtml;
    d = new Date(yr, mo+1, 1);
  }
  document.getElementById('cal-view').innerHTML = html;
}
function renderList() {
  const f = filtered();
  if (!f.length) { document.getElementById('list-view').innerHTML = '<p style="color:#b4b2a9;padding:1rem">No games match the current filter.</p>'; return; }
  const sorted = [...f].sort((a,b) => parseDate(a.date)-parseDate(b.date) || a.time.localeCompare(b.time));
  const byDate = {};
  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  sorted.forEach(e => { (byDate[e.date] = byDate[e.date]||[]).push(e); });
  let html = '';
  Object.keys(byDate).sort((a,b)=>parseDate(a)-parseDate(b)).forEach(date => {
    const dt = parseDate(date);
    html += `<div class="list-date">${DAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}</div>`;
    byDate[date].forEach(ev => {
      const c = COLOR[ev.ourTeam] || '#888';
      const haColor = ev.ha==='Home' ? '#1D9E75' : '#BA7517';
      html += `<div class="list-event" onclick="showModal(${ev.match})">
        <div class="list-dot" style="background:${c}"></div>
        <div class="list-info">
          <div class="list-team" style="color:${c}">${ev.ourTeam}</div>
          <div class="list-opp">vs ${ev.opponent}</div>
          <div class="list-meta">${fmt12(ev.time)} · ${ev.location}</div>
        </div>
        <div class="list-ha" style="background:${haColor}22;color:${haColor};border:0.5px solid ${haColor}55">${ev.ha}</div>
      </div>`;
    });
  });
  document.getElementById('list-view').innerHTML = html;
}
function showModal(matchId) {
  const ev = RAW.find(e => e.match === matchId);
  if (!ev) return;
  const c = COLOR[ev.ourTeam] || '#888';
  const haColor = ev.ha==='Home' ? '#1D9E75' : '#BA7517';
  const dt = parseDate(ev.date);
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  document.getElementById('modal-content').innerHTML = `
    <div class="modal-team" style="color:${c}">${ev.ourTeam}</div>
    <div class="modal-title">vs ${ev.opponent}</div>
    <div class="modal-row"><span class="modal-label">When</span><span>${DAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()} · ${fmt12(ev.time)}</span></div>
    <div class="modal-row"><span class="modal-label">Location</span><span>${ev.location}</span></div>
    <div class="modal-row"><span class="modal-label">Home/Away</span><span style="color:${haColor};font-weight:500">${ev.ha}</span></div>
    <div class="modal-row"><span class="modal-label">Match #</span><span>${ev.match}</span></div>
    <div class="modal-row"><span class="modal-label">Division</span><span>${ev.gender} · U${ev.age}</span></div>
  `;
  document.getElementById('modal-bg').style.display = 'flex';
}
function closeModal() { document.getElementById('modal-bg').style.display = 'none'; }

buildLegend();
updateStats();
render();
