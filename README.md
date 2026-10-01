# Atacama Sea Salt · Gestión financiera

Aplicación web que reemplaza el presupuesto y el flujo de caja en Excel.

## Cómo correrla

```bash
npm install
npm run setup   # crea la base SQLite y carga los datos semilla
npm run dev     # API en http://localhost:4000 y web en http://localhost:5180
npm test
```

El usuario inicial se define en `apps/api/.env` (`ADMIN_USUARIO` / `ADMIN_CLAVE`); copia `apps/api/.env.example` si no existe.
`npm run seed -- --reset` borra la base y vuelve a cargar la semilla.

## Estructura

- `packages/core`: lógica de cálculo en TypeScript puro, con sus tests (formatos chilenos, hitos, escalas, incoterms, MP por camión).
- `apps/api`: Fastify + Prisma. `prisma/schema.prisma` es el modelo de datos; `prisma/seed.ts`, los datos semilla.
- `apps/web`: React + Vite + Tailwind + AG Grid. Las pantallas de maestros se declaran en `src/paginas.tsx`.
- `docs/modelo-datos.mmd`: diagrama de entidades.

## Convenciones

- Montos como enteros: CLP sin decimales, USD en centavos. Precios unitarios, tipos de cambio y porcentajes como Decimal.
- La interfaz muestra y lee números en formato chileno (1.234.567,89) y fechas dd-mm-aaaa.
- Todo cambio hecho desde la app queda en la tabla de auditoría.
