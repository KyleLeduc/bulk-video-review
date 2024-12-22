const { createServer } = require('vite')

async function startServers() {
  const ports = [3000, 3001]

  await Promise.all(
    ports.map(async (port) => {
      const server = await createServer({
        server: {
          port,
        },
      })
      await server.listen()
      console.log(`Vite dev server running at http://localhost:${port}`)
    }),
  )
}

startServers()
