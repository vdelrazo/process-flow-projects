module.exports = async ({ github, context }) => {
  const org = 'vdelrazo';
  const projectNumber = 1;

  // 1. Extraer el número de issue del nombre del branch
  // Convención: feature/20-sandbox-credentials, fix/14-handler-create, chore/18-servicebus-config
  const ref = context.payload.ref;
  const match = ref.match(/^[^/]+\/(\d+)-/);
  if (!match) {
    console.log(`No se pudo extraer número de issue del branch '${ref}' — asegúrate de seguir la convención feature/NNN-descripción`);
    return;
  }
  const issueNumber = parseInt(match[1], 10);

  // 2. Obtener el node_id del issue via REST API
  const issueData = await github.rest.issues.get({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: issueNumber
  });
  const issueNodeId = issueData.data.node_id;

  // 3. Obtener el Project ID y campos
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

  // 4. Encontrar el campo Status y la opción "In Progress"
  const statusField = project.fields.nodes.find(f => f.name === 'Status');
  if (!statusField) {
    console.log('Campo Status no encontrado — verifica el nombre en el Project');
    return;
  }

  const devOption = statusField.options.find(o => o.name.toLowerCase().includes('progress'));
  if (!devOption) {
    console.log('Opción In Progress no encontrada — verifica el nombre exacto de la columna');
    return;
  }

  // 5. Agregar el issue al proyecto
  const addItem = await github.graphql(
    `mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }`,
    { projectId, contentId: issueNodeId }
  );

  const itemId = addItem.addProjectV2ItemById.item.id;

  // 6. Mover el item a "In Progress"
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
      optionId: devOption.id
    }
  );

  console.log('Issue #' + issueNumber + ' movido a In Progress en Project #' + projectNumber);
};
