export const config = { runtime: "edge" };

export default async function handler() {
  const now = new Date().toISOString();
  const mock = [
    { train: "7 Local", headwaySec: 180, direction: "Manhattan-bound" },
    { train: "7 Express", headwaySec: 420, direction: "Queens-bound" },
  ];

  const rows = mock
    .map(
      (r) => `<tr>
        <td>${r.train}</td>
        <td>${r.direction}</td>
        <td>${Math.round(r.headwaySec / 60)} min</td>
      </tr>`
    )
    .join("");

  const html = `
    <p class="contrast">Last update: ${now}</p>
    <table role="grid">
      <thead>
        <tr><th>Service</th><th>Direction</th><th>ETA / Headway</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
