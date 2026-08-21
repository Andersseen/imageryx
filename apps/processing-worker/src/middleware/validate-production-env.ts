import { assertSafeProductionSecrets } from "@imageryx/image-core";
import { createMiddleware } from "hono/factory";
import type { RequestIdVariables } from "./request-id";

export const validateProductionEnv = createMiddleware<{
  Bindings: Env;
  Variables: RequestIdVariables;
}>(async (c, next) => {
  if (c.env.TRANSFORMATION_PROVIDER === "cloudinary") {
    assertSafeProductionSecrets(c.env.APP_ENV, [
      {
        name: "CLOUDINARY_CLOUD_NAME",
        value: c.env.CLOUDINARY_CLOUD_NAME,
        unsafeDefaultValue: "",
      },
      {
        name: "CLOUDINARY_API_KEY",
        value: c.env.CLOUDINARY_API_KEY,
        unsafeDefaultValue: "",
      },
      {
        name: "CLOUDINARY_API_SECRET",
        value: c.env.CLOUDINARY_API_SECRET,
        unsafeDefaultValue: "",
      },
    ]);
  }
  await next();
});
