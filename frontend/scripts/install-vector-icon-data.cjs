const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const names = ['create-tenancy-line', 'exit-request-blue-line', 'tenancy-history-line', 'upcoming-exits-line', 'tenancy-active-line', 'tenancy-on-notice-line', 'tenancy-started-line', 'tenancy-ended-line', 'digest-payments-line', 'digest-concerns-line', 'digest-move-ins-line', 'digest-move-outs-line'];
const data = {};
for (const name of names) {
  const svg = fs.readFileSync(path.join(root, 'assets/vector-drawings/preview', name + '.svg'), 'utf8');
  data[name] = { viewBox: svg.match(/viewBox="([^"]+)"/)[1], d: svg.match(/ d="([^"]+)"/)[1] };
}
fs.writeFileSync(path.join(root, 'src/components/tenancy-vector-data.json'), JSON.stringify(data));
console.log('Installed 12 approved SVG paths; PNG files untouched.');
