module.exports = async ({ github, context }) => {
  const org = 'tiendas-3b';
  const projectNumber = 6;

  // 1. Obtener el Project ID y campos
  const projectQuery = await github.graphql(
    `query($org: String!, $number: Int!) {
      organization(login: $org) {
        projectV2(number: $number) {
          id
          fields(first: 20) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }`,
    { org, number: projectNumber }
  );

  const project = projectQuery.organization.projectV2;
  const projectId = project.id;

  // 2. Encontrar el campo Status y la opción "Review"
  const statusField = project.fields.nodes.find(f => f.name === 'Status');
  if (!statusField) {
    console.log('Campo Status no encontrado — verifica el nombre en el Project');
    return;
  }

  const reviewOption = statusField.options.find(o => o.name.includes('Review'));
  if (!reviewOption) {
    console.log('Opción Review no encontrada — verifica el nombre exacto de la columna');
    return;
  }

  // 3. Agregar el PR al proyecto
  const prNodeId = context.payload.pull_request.node_id;

  const addItem = await github.graphql(
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`,
    { projectId, contentId: prNodeId }
  );

  const itemId = addItem.addProjectV2ItemById.item.id;

  // 4. Mover el item a "Review"
  await github.graphql(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item { id }
      }
    }`,
    {
      projectId,
      itemId,
      fieldId: statusField.id,
      optionId: reviewOption.id
    }
  );

  console.log('PR movido a Review en Project #' + projectNumber);
};
