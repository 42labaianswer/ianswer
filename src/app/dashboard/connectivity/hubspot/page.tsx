 

// Re-exporta la página de HubSpot de /crm en lugar de duplicarla.
// Antes este archivo era una copia byte por byte de crm/hubspot/page.tsx
// (710 líneas duplicadas): cualquier arreglo había que hacerlo dos veces.
export { default } from "../../crm/hubspot/page"

