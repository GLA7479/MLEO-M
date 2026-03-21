# MINERS browser snippets

להריץ בקונסול:

```js
const device = await fetch('/api/arcade/device', {
  method: 'GET',
  credentials: 'include'
}).then(r => r.json());

const miners = await fetch('/api/miners/state', {
  method: 'GET',
  credentials: 'include'
}).then(r => r.json());

console.log({ device, miners });
```

מה מחפשים:

* device success
* miners state success
* mined/balance values
* no device init errors
