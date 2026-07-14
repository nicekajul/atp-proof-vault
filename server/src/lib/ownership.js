/** True if the authenticated team user is the creator of the given project row. */
export function isProjectOwner(project, user) {
  return Boolean(project) && Boolean(user) && String(project.createdBy) === String(user.sub);
}
