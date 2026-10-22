/* eslint-disable react-doctor/async-await-in-loop */
import { config } from "dotenv";
config({ path: ".env.local" });
import { BigQuery } from "@google-cloud/bigquery";
const bq = new BigQuery({
  projectId: process.env.GCP_PROJECT_ID || "mfhub-501815",
  credentials: process.env.GCP_CLIENT_EMAIL && process.env.GCP_PRIVATE_KEY ? {
    client_email: process.env.GCP_CLIENT_EMAIL,
    private_key: process.env.GCP_PRIVATE_KEY.replace(/\\n/g, "\n"),
  } : undefined,
});
(async () => {
  for (const ds of ["1o8Hub", "1o8BibleApp"]) {
    try {
      const [meta] = await bq.dataset(ds).table("AAC").getMetadata();
      console.log(`=== ${ds}.AAC ===`);
      console.log(JSON.stringify(meta.schema?.fields?.map((f:any)=>({name:f.name,type:f.type})), null, 2));
      break;
    } catch(e:any) { console.log(`${ds}: ${e.message?.slice(0,120)}`); }
  }
})();
