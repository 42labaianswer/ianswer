import { redirect } from "next/navigation"
import { ROUTES } from "../../../../lib/routes"

// Equipo vive fuera de /crm (ROUTES.team). Esta redirección evita romper
// enlaces o marcadores guardados.
export default function CrmEquipoRedirect() {
  redirect(ROUTES.team)
}
