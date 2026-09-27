import { redirect } from "next/navigation"
import { ROUTES } from "../../../../lib/routes"

// Equipo ya no vive dentro de /crm (plan-agente-semana04, 6.2). Se deja esta
// redirección para no romper enlaces o marcadores guardados.
export default function CrmEquipoRedirect() {
  redirect(ROUTES.team)
}
