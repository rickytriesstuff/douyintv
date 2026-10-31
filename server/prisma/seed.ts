import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const movies = [
 ["The Last Frontier","A rescue team ventures beyond the edge of the known world.",2025,["Adventure","Sci-Fi"]],
 ["Neon City","A detective follows a signal through a city that never sleeps.",2024,["Sci-Fi","Thriller"]],
 ["Wild Earth","A breathtaking journey across the planet's last untouched places.",2025,["Documentary","Nature"]],
 ["After Hours","One night. Two strangers. A secret that changes everything.",2023,["Drama","Mystery"]],
 ["The Deep","A research crew discovers something ancient beneath the ocean.",2024,["Adventure","Thriller"]],
 ["Echoes of Tomorrow","A scientist receives messages from a future that should not exist.",2025,["Sci-Fi","Drama"]],
 ["Red Horizon","A distant colony fights to survive after contact with Earth is lost.",2024,["Action","Sci-Fi"]],
 ["Silent Run","A courier must cross a locked-down city before sunrise.",2023,["Action","Thriller"]],
 ["Golden","An unlikely team chase a fortune hidden in plain sight.",2025,["Comedy","Adventure"]],
 ["The Signal","A mysterious broadcast connects people across impossible distances.",2024,["Mystery","Sci-Fi"]]
] as const;
const series = [
 ["Northbound","A small town becomes the centre of a story much bigger than itself.",2025,["Drama","Mystery"]],
 ["Parallel","Two lives in different realities begin to overlap.",2024,["Sci-Fi","Drama"]],
 ["The Night Shift","The staff of a city hospital face extraordinary nights.",2023,["Drama","Medical"]]
] as const;
async function main(){
 for(const [title,description,year,genres] of movies){const slug=title.toLowerCase().replace(/[^a-z0-9]+/g,"-");await prisma.media.upsert({where:{slug},update:{},create:{title,slug,description,kind:"MOVIE",sourceType:"EMBED",status:"PUBLISHED",year,genres:JSON.stringify(genres),cast:"[]",posterUrl:"https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600",backdropUrl:"https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1600"}})}
 for(const [title,description,year,genres] of series){const slug=title.toLowerCase().replace(/[^a-z0-9]+/g,"-");await prisma.media.upsert({where:{slug},update:{},create:{title,slug,description,kind:"SERIES",sourceType:"EMBED",status:"PUBLISHED",year,genres:[...genres],posterUrl:"https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600",backdropUrl:"https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=1600"}})}
 console.log("Seeded 10 sample movies and 3 sample series.");
}
main().catch(error=>{console.error(error);process.exit(1)}).finally(async()=>prisma.$disconnect());
