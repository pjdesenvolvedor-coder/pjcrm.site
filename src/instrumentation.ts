export async function register() {
  // Executa apenas no runtime Node.js do servidor (ignora Edge/Client)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const g = globalThis as any;
    if (g.__pjcrmServerCronStarted) return;
    g.__pjcrmServerCronStarted = true;

    console.log('[ServerCron] Motor de automação 24/7 iniciado no servidor (independe de navegador aberto).');

    const runServerCron = async () => {
      try {
        const { GET } = await import('@/app/api/cron/run/route');
        const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://pjcrm.site';
        await GET(new Request(`${origin}/api/cron/run`));
      } catch (err: any) {
        console.warn('[ServerCron] Erro no ciclo automático:', err?.message || err);
      }
    };

    // Primeiro disparo 15s após subir o servidor e depois a cada 45 segundos 24/7
    setTimeout(() => {
      runServerCron();
      setInterval(runServerCron, 45 * 1000);
    }, 15 * 1000);
  }
}
