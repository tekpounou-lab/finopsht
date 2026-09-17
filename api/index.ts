import { createApp } from "../server";

let appHandler: any = null;

export default async function handler(req: any, res: any) {
  if (!appHandler) {
    appHandler = await createApp();
  }
  return appHandler(req, res);
}
