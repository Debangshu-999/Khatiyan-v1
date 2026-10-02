const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'src/components/tenancy-vector-data.json');
const data = JSON.parse(fs.readFileSync(target, 'utf8'));
const active = data['tenancy-active-line'];
// Retain the original sheet, portrait and circular ring; replace only its interior.
const symbols = {
  'tenancy-on-notice-line': 'M839 948V887C839 852 864 827 900 827C936 827 961 852 961 887V948L980 970H820Z M881 1000Q900 1020 919 1000',
  'tenancy-started-line': 'M900 844V996M824 920H976',
  'tenancy-ended-line': 'M824 920H976',
  'exit-request-blue-line': 'M818 920H982M930 868L982 920L930 972',
  'upcoming-exits-line': 'M844 832H956M844 1008H956M852 832V865Q852 886 900 920Q948 954 948 975V1008M948 832V865Q948 886 900 920Q852 954 852 975V1008',
};
for (const [name, badge] of Object.entries(symbols)) {
  data[name] = { ...active, badge, badgeCutout: 'M0 0H1254V1254H0Z M1066 920A166 166 0 1 0 734 920A166 166 0 1 0 1066 920Z' };
  const color = name.startsWith('tenancy-') ? '#000000' : '#3F6ED8';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${active.viewBox}"><defs><clipPath id="body"><path d="${data[name].badgeCutout}" clip-rule="evenodd"/></clipPath></defs><path d="${active.d}" fill="${color}" fill-rule="evenodd" clip-path="url(#body)"/><path d="${badge}" fill="none" stroke="${color}" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  fs.writeFileSync(path.join(root, 'assets/vector-drawings/preview', name + '.svg'), svg);
}
fs.writeFileSync(target, JSON.stringify(data));
console.log('Updated five icons using the unchanged Active sheet and circular ring.');
