# BASE browser snippets

להריץ בקונסול:

```js
const device = await fetch('/api/arcade/device', {
  method: 'GET',
  credentials: 'include'
}).then(r => r.json());

const csrf = await fetch('/api/csrf-token', {
  method: 'GET',
  credentials: 'include'
}).then(r => r.json());

const base = await fetch('/api/base/state', {
  method: 'GET',
  credentials: 'include'
}).then(r => r.json());

console.log({ device, csrf, base });
```

מה מחפשים:

* device success
* csrf token returned
* base state success
* banked_mleo value
* no forbidden errors
