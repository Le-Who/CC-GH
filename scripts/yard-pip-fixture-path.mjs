import path from 'node:path';
// Normalize the root before appending a separator: URL-derived directory paths
// have a trailing slash, which otherwise turns the boundary into a double slash.
export function fixtureFilePath(root,relative){
 const base=path.resolve(root),target=path.resolve(base,relative);
 return target===base||target.startsWith(base+path.sep)?target:null;
}
